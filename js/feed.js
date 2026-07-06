import { supabase } from "./supabase.js";
import { notifyLike, removeLikeNotification, notifyComment, removeNotificationsForPost } from "./notifications.js";
import { fetchViewsForPosts, observeViews } from "./views.js";

// ===== ФОРМАТИРОВАНИЕ ВРЕМЕНИ =====
function formatTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60)             return "только что";
    if (diff < 3600)           return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400)          return `${Math.floor(diff / 3600)} ч. назад`;
    if (diff < 86400 * 7)      return `${Math.floor(diff / 86400)} д. назад`;

    return date.toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

/*
Переиспользуемый рендер ленты постов конкретного пользователя.
Используется на странице своего профиля (profile.html)
и на странице чужого профиля (user.html).

renderUserFeed(containerEl, targetUserId, modalEls)
- containerEl: DOM-элемент, куда рендерить карточки постов
- targetUserId: id пользователя, чьи посты показываем
- modalEls: { postModal, modalImageSide, modalInfoSide } — элементы модалки поста
*/

export async function renderUserFeed(containerEl, targetUserId, modalEls) {

    const {
        data: posts,
        error
    } = await supabase
        .from("posts")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    const {
        data: likesData
    } = await supabase
        .from("likes")
        .select("*");

    const {
        data: commentsData
    } = await supabase
        .from("comments")
        .select("*");

    const {
        data: { user: currentUser }
    } = await supabase.auth.getUser();

    const viewsData = await fetchViewsForPosts(posts.map(p => p.id));

    function viewsCountFor(postId) {
        return viewsData.filter(v => v.post_id === postId).length;
    }

    containerEl.innerHTML = "";

    if (!posts || posts.length === 0) {
        containerEl.innerHTML = `<p class="empty-feed">Публикаций пока нет</p>`;
        return;
    }

    posts.forEach(post => {

        const canDelete =
            currentUser &&
            currentUser.id === post.user_id;

        const postLikes =
            (likesData || []).filter(
                like => like.post_id === post.id
            );

        const postComments =
            (commentsData || []).filter(
                comment => comment.post_id === post.id
            );

        const commentsCount = postComments.length;
        const likesCount = postLikes.length;

        const isLiked =
            currentUser &&
            postLikes.some(
                like => like.user_id === currentUser.id
            );

        containerEl.innerHTML += `

        <div class="post" data-id="${post.id}">

            <div>
                <a href="user.html?id=${post.user_id}" class="post-author-link" onclick="event.stopPropagation()">
                    <img
                    src="${post.avatar_url || 'https://placehold.co/50'}"
                    width="50"
                    height="50">

                    <strong>
                        ${post.username || "Unknown"}
                    </strong>
                </a>
                <span class="post-time">🕐 ${formatTime(post.created_at)}</span>
            </div>

            <p>
                ${post.content || ""}
            </p>

            ${
                (() => {
                    if (!post.video_url && !post.image_url) return "";
                    const mediaTag = post.video_url
                        ? `<video class="post-video" src="${post.video_url}" controls></video>`
                        : `<img class="post-image" src="${post.image_url}">`;
                    if (!post.is_adult) return mediaTag;
                    return `<div class="post-media-wrapper blurred">
                        ${mediaTag}
                        <div class="adult-overlay">
                            <span class="adult-badge">18+</span>
                            <span class="adult-hint">Нажмите, чтобы посмотреть</span>
                        </div>
                    </div>`;
                })()
            }

            <div class="post-stats">
                <button class="likeBtn" data-id="${post.id}">
                    ${isLiked ? "❤️" : "🤍"} ${likesCount}
                </button>

                <span class="post-comments-open" data-id="${post.id}">
                    💬 ${commentsCount}
                </span>

                <span class="post-views">
                    👁 ${viewsCountFor(post.id)}
                </span>
            </div>

            <br>

            ${
                canDelete
                ?
                `<button class="deletePostBtn">🗑 Удалить</button>`
                :
                ""
            }

            <hr>

        </div>

        `;

    });

    // Счёт просмотров: засчитываем, когда карточка реально показалась
    // пользователю (не сразу при рендере списка).
    observeViews(containerEl, posts, currentUser, (postId) => {
        viewsData.push({ post_id: postId });
        const span = containerEl.querySelector(`.post[data-id="${postId}"] .post-views`);
        if (span) span.textContent = `👁 ${viewsCountFor(postId)}`;
    });

    /* Удаление поста */
    containerEl
        .querySelectorAll(".deletePostBtn")
        .forEach(button => {

            button.onclick = async (event) => {

                const postElement = event.target.closest(".post");
                const postId = postElement.dataset.id;

                if (!confirm("Удалить пост?")) {
                    return;
                }

                const { error } = await supabase
                    .from("posts")
                    .delete()
                    .eq("id", postId);

                if (error) {
                    alert(error.message);
                    return;
                }

                await removeNotificationsForPost(postId);

                renderUserFeed(containerEl, targetUserId, modalEls);
            };

        });

    /* Лайки */
    containerEl
        .querySelectorAll(".likeBtn")
        .forEach(button => {

            button.onclick = async () => {

                const postId = Number(button.dataset.id);

                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    alert("Войдите в аккаунт");
                    return;
                }

                const post = posts.find(p => p.id === postId);

                const { data: existingLike } = await supabase
                    .from("likes")
                    .select("*")
                    .eq("post_id", postId)
                    .eq("user_id", user.id)
                    .maybeSingle();

                if (existingLike) {
                    await supabase
                        .from("likes")
                        .delete()
                        .eq("post_id", postId)
                        .eq("user_id", user.id);
                    if (post) await removeLikeNotification(post.user_id, user.id, postId);
                } else {
                    await supabase
                        .from("likes")
                        .insert({
                            post_id: postId,
                            user_id: user.id
                        });
                    if (post) await notifyLike(post.user_id, user.id, postId);
                }

                renderUserFeed(containerEl, targetUserId, modalEls);
            };

        });

    /* Открытие модалки по клику на медиа поста или счётчик комментариев */
    if (modalEls) {

        function openDetailModal(postId) {

            const post = posts.find(p => p.id === postId);
            if (!post) return;

            const postComments =
                (commentsData || []).filter(
                    comment => comment.post_id === postId
                );

            const postLikes =
                (likesData || []).filter(
                    like => like.post_id === postId
                );

            const commentsCount = postComments.length;
            const likesCount = postLikes.length;

            const commentsHtml = postComments.map(comment => `
                <div class="comment">
                    <strong>${comment.username}</strong>
                    <span class="comment-time">🕐 ${formatTime(comment.created_at)}</span>
                    <div>${comment.content}</div>
                </div>
            `).join("");

            const mediaTag = post.video_url
                ? `<video src="${post.video_url}" controls autoplay></video>`
                : `<img src="${post.image_url || ''}">`;

            modalEls.modalImageSide.innerHTML = post.is_adult
                ? `<div class="post-media-wrapper blurred">
                    ${mediaTag}
                    <div class="adult-overlay">
                        <span class="adult-badge">18+</span>
                        <span class="adult-hint">Нажмите, чтобы посмотреть</span>
                    </div>
                </div>`
                : mediaTag;

            modalEls.modalInfoSide.innerHTML = `
                <h2>
                    <a href="user.html?id=${post.user_id}" class="modal-author-link">
                        ${post.username}
                    </a>
                </h2>
                <div class="post-time">🕐 ${formatTime(post.created_at)}</div>
                <p>${post.content || ""}</p>
                <hr>
                <div class="post-stats">
                    ❤️ ${likesCount}
                    &nbsp;&nbsp;
                    💬 ${commentsCount}
                    &nbsp;&nbsp;
                    👁 ${viewsCountFor(postId)}
                </div>
                <h3>Комментарии</h3>
                <div class="comments">${commentsHtml}</div>
                <hr>
                <div class="comment-form">
                    <input id="modalCommentInput" placeholder="Написать комментарий">
                    <button id="modalCommentBtn">Отправить</button>
                </div>
                ${
                    currentUser && currentUser.id === post.user_id
                    ?
                    `<button id="deleteModalPost">🗑 Удалить пост</button>`
                    :
                    ""
                }
            `;

            modalEls.postModal.style.display = "flex";

            const modalOverlay = modalEls.modalImageSide.querySelector(".adult-overlay");
            if (modalOverlay) {
                modalOverlay.onclick = (e) => {
                    e.stopPropagation();
                    modalOverlay.closest(".post-media-wrapper").classList.remove("blurred");
                    modalOverlay.remove();
                };
            }

            const deleteBtn = document.getElementById("deleteModalPost");

            if (deleteBtn) {
                deleteBtn.onclick = async () => {
                    await supabase
                        .from("posts")
                        .delete()
                        .eq("id", postId);

                    await removeNotificationsForPost(postId);

                    modalEls.postModal.style.display = "none";
                    renderUserFeed(containerEl, targetUserId, modalEls);
                };
            }

            document.getElementById("modalCommentBtn").onclick = async () => {

                const text = document
                    .getElementById("modalCommentInput")
                    .value.trim();

                if (!text) return;

                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    alert("Войдите в аккаунт");
                    return;
                }

                const { data: profile } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("id", user.id)
                    .single();

                await supabase
                    .from("comments")
                    .insert({
                        post_id: postId,
                        user_id: user.id,
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                        content: text
                    });

                await notifyComment(post.user_id, user.id, postId, text);

                renderUserFeed(containerEl, targetUserId, modalEls);
            };
        }

        containerEl
            .querySelectorAll(".post-image, .post-video, .post-comments-open")
            .forEach(el => {
                el.onclick = () => {
                    const postCard = el.closest(".post");
                    const postId = Number(postCard.dataset.id);
                    openDetailModal(postId);
                };
            });

        // 18+ оверлей в карточке ленты: первый клик снимает блюр, не открывая модалку
        containerEl
            .querySelectorAll(".adult-overlay")
            .forEach(overlay => {
                overlay.onclick = (e) => {
                    e.stopPropagation();
                    overlay.closest(".post-media-wrapper").classList.remove("blurred");
                    overlay.remove();
                };
            });

    }

}
