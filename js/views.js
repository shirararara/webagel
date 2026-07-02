import { supabase } from "./supabase.js";

/*
=====================================================================
СИСТЕМА ПРОСМОТРОВ ПУБЛИКАЦИЙ

Хранение: таблица post_views, одна строка = один засчитанный просмотр
(post_id, user_id, hour_bucket). hour_bucket — номер часа с начала эпохи
(Date.now() / 3600000, целая часть). Уникальный индекс в БД на
(post_id, user_id, hour_bucket) не даёт засчитать больше одного
просмотра одного поста одним пользователем в течение одного часа —
если запись уже есть, upsert с ignoreDuplicates молча её пропускает,
без ошибок и без дублей. Ограничение работает на уровне базы, поэтому
его нельзя обойти, открыв несколько вкладок или перезагрузив страницу.

Автору не засчитываются просмотры собственных публикаций.

SQL для создания таблицы — см. views.sql в корне проекта.
=====================================================================
*/

function currentHourBucket() {
    return Math.floor(Date.now() / 3600000);
}

// Кэш на время жизни страницы: не пытаемся повторно засчитать
// просмотр одного и того же поста в течение одного и того же часа,
// чтобы не дёргать сеть при повторном скролле мимо поста.
const registeredThisSession = new Set();

/*
Пытается засчитать просмотр поста текущим пользователем.
Возвращает true, если просмотр реально был новым и засчитан
(то есть счётчик на экране нужно увеличить на 1), и false —
если просмотр не засчитан (не авторизован, свой пост, либо
просмотр этого поста в этот час уже был засчитан ранее).
*/
export async function registerView(postId, authorId, currentUser) {
    if (!currentUser || !postId) return false;
    if (authorId && currentUser.id === authorId) return false;

    const bucket = currentHourBucket();
    const sessionKey = `${postId}:${currentUser.id}:${bucket}`;
    if (registeredThisSession.has(sessionKey)) return false;
    registeredThisSession.add(sessionKey);

    const { data, error } = await supabase
        .from("post_views")
        .upsert({
            post_id:     postId,
            user_id:     currentUser.id,
            hour_bucket: bucket,
            viewed_at:   new Date().toISOString()
        }, { onConflict: "post_id,user_id,hour_bucket", ignoreDuplicates: true })
        .select();

    if (error) {
        console.error(error);
        return false;
    }

    // Если строка уже существовала (просмотр в этот час уже был), upsert
    // с ignoreDuplicates ничего не вернёт — data будет пустым.
    return (data || []).length > 0;
}

// Просмотры для набора постов — грузим все строки и считаем на клиенте,
// как это уже сделано для лайков и комментариев в posts.js/feed.js.
export async function fetchViewsForPosts(postIds) {
    if (!postIds || postIds.length === 0) return [];

    const { data, error } = await supabase
        .from("post_views")
        .select("post_id")
        .in("post_id", postIds);

    if (error) { console.error(error); return []; }
    return data || [];
}

// Просмотры с датами — нужны для графика в Центре авторов.
export async function fetchViewsWithDates(postIds) {
    if (!postIds || postIds.length === 0) return [];

    const { data, error } = await supabase
        .from("post_views")
        .select("post_id, viewed_at")
        .in("post_id", postIds);

    if (error) { console.error(error); return []; }
    return data || [];
}

/*
Навешивает IntersectionObserver на карточки постов внутри containerEl:
просмотр засчитывается только когда карточка реально показалась
пользователю (минимум наполовину), а не сразу при рендере списка.
Как только просмотр обработан (успешно или нет) — карточка снимается
с наблюдения, повторно не проверяется.

onCounted(postId) вызывается только если просмотр был новым и
реально засчитан — используйте это, чтобы точечно обновить счётчик
в DOM без перезагрузки всей ленты.
*/
export function observeViews(containerEl, posts, currentUser, onCounted) {
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const postEl = entry.target;
            observer.unobserve(postEl);

            const postId = Number(postEl.dataset.id);
            const post   = posts.find(p => p.id === postId);
            if (!post) return;

            registerView(postId, post.user_id, currentUser).then(counted => {
                if (counted && onCounted) onCounted(postId);
            });
        });
    }, { threshold: 0.5 });

    containerEl.querySelectorAll(".post").forEach(el => observer.observe(el));
}
