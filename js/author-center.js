import { supabase } from "./supabase.js";
import {
    getFollowersCount,
    getFollowingCount
} from "./follows.js";
import { fetchViewsWithDates } from "./views.js";

// ===== Утилита: детерминированное "случайное" число по строке =====
// Нужно, чтобы демо-данные были стабильными для одного и того же пользователя,
// а не дёргались при каждой перезагрузке страницы.
function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }
    return function () {
        hash = (hash * 9301 + 49297) % 233280;
        return hash / 233280;
    };
}

function formatDayLabel(date) {
    return date.toLocaleDateString("ru-RU", { weekday: "short" });
}

function renderBarChart(container, items, accentColor = "#ff4e8b") {
    const max = Math.max(1, ...items.map(i => i.value));
    container.innerHTML = items.map(item => `
        <div class="chart-col">
            <div class="chart-col-track">
                <div class="chart-col-bar" style="height:${Math.max(4, (item.value / max) * 100)}%; background:${accentColor}"></div>
            </div>
            <span class="chart-col-value">${item.value}</span>
            <span class="chart-col-label">${item.label}</span>
        </div>
    `).join("");
}

async function init() {

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        location.href = "login.html";
        return;
    }

    // ===== Профиль =====
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    document.getElementById("analyticsUsername").textContent =
        profile?.username || user.email || "Без имени";

    if (profile?.avatar_url) {
        document.getElementById("analyticsAvatar").src = profile.avatar_url;
    }

    // ===== Публикации пользователя =====
    const { data: posts, error: postsError } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    if (postsError) {
        console.error(postsError);
    }

    const userPosts = posts || [];
    const postIds = userPosts.map(p => p.id);

    document.getElementById("statPosts").textContent = userPosts.length;

    // ===== Лайки, комментарии и просмотры на эти публикации =====
    let likes = [];
    let comments = [];
    let views = [];

    if (postIds.length > 0) {
        const { data: likesData } = await supabase
            .from("likes")
            .select("*")
            .in("post_id", postIds);

        const { data: commentsData } = await supabase
            .from("comments")
            .select("*")
            .in("post_id", postIds);

        likes = likesData || [];
        comments = commentsData || [];
        views = await fetchViewsWithDates(postIds);
    }

    document.getElementById("statLikes").textContent = likes.length;
    document.getElementById("statComments").textContent = comments.length;
    document.getElementById("statViews").textContent = views.length;

    const engagementPerPost = userPosts.length > 0
        ? ((likes.length + comments.length) / userPosts.length).toFixed(1)
        : "0.0";

    document.getElementById("statEngagement").textContent = engagementPerPost;

    // ===== Подписчики / подписки =====
    const [followers, following] = await Promise.all([
        getFollowersCount(user.id),
        getFollowingCount(user.id)
    ]);

    document.getElementById("statFollowers").textContent = followers;
    document.getElementById("statFollowing").textContent = following;

    // ===== График активности за 7 дней (реальные данные по датам публикаций) =====
    const today = new Date();
    const days = [];

    for (let i = 6; i >= 0; i--) {
        const day = new Date(today);
        day.setDate(today.getDate() - i);
        day.setHours(0, 0, 0, 0);
        days.push(day);
    }

    const postsPerDay = days.map(day => {
        const next = new Date(day);
        next.setDate(day.getDate() + 1);

        const count = userPosts.filter(p => {
            const created = new Date(p.created_at);
            return created >= day && created < next;
        }).length;

        return { label: formatDayLabel(day), value: count };
    });

    renderBarChart(document.getElementById("postsChart"), postsPerDay);

    // ===== Лучшая публикация по лайкам =====
    const topPostCard = document.getElementById("topPostCard");

    if (userPosts.length > 0) {
        const postsWithStats = userPosts.map(post => ({
            post,
            likes: likes.filter(l => l.post_id === post.id).length,
            comments: comments.filter(c => c.post_id === post.id).length,
            views: views.filter(v => v.post_id === post.id).length
        }));

        postsWithStats.sort((a, b) => b.likes - a.likes);
        const top = postsWithStats[0];

        topPostCard.innerHTML = `
            ${top.post.image_url ? `<img src="${top.post.image_url}" class="top-post-image">` : ""}
            <div class="top-post-info">
                <p>${(top.post.content || "Без текста").slice(0, 160)}</p>
                <div class="post-stats">
                    <span>❤️ ${top.likes}</span>
                    <span>💬 ${top.comments}</span>
                    <span>👁 ${top.views}</span>
                </div>
            </div>
        `;
    }

    // ===== Реальная аналитика просмотров публикаций за 7 дней =====
    const viewsPerDay = days.map(day => {
        const next = new Date(day);
        next.setDate(day.getDate() + 1);

        const count = views.filter(v => {
            const viewedAt = new Date(v.viewed_at);
            return viewedAt >= day && viewedAt < next;
        }).length;

        return { label: formatDayLabel(day), value: count };
    });

    renderBarChart(document.getElementById("viewsChart"), viewsPerDay, "#7c5cff");

    // ===== Условные (демо) источники аудитории =====
    // Примечание: seededRandom(user.id) используется только здесь —
    // реального учёта источников переходов (откуда пришёл просмотр) в проекте нет.
    const rand = seededRandom(user.id);
    const sources = [
        { label: "Рекомендации", icon: "✦" },
        { label: "Поиск", icon: "🔍" },
        { label: "Профили подписок", icon: "👥" },
        { label: "Прямые ссылки", icon: "🔗" }
    ];

    let raw = sources.map(s => 0.2 + rand());
    const total = raw.reduce((a, b) => a + b, 0);
    raw = raw.map(v => Math.round((v / total) * 100));

    // Корректируем округление, чтобы сумма была ровно 100%
    const diff = 100 - raw.reduce((a, b) => a + b, 0);
    raw[0] += diff;

    const audienceList = document.getElementById("audienceList");
    audienceList.innerHTML = sources.map((s, idx) => `
        <div class="audience-row">
            <span class="audience-icon">${s.icon}</span>
            <span class="audience-name">${s.label}</span>
            <div class="audience-bar-track">
                <div class="audience-bar-fill" style="width:${raw[idx]}%"></div>
            </div>
            <span class="audience-percent">${raw[idx]}%</span>
        </div>
    `).join("");
}

init();
