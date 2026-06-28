import { supabase } from "./supabase.js";

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
                post.image_url
                ?
                `<img class="post-image" src="${post.image_url}">`
                :
                ""
            }

            <div class="post-stats">
                <button class="likeBtn" data-id="${post.id}">
                    ${isLiked ? "❤️" : "🤍"} ${likesCount}
                </button>

                <span>
                    💬 ${commentsCount}
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
                } else {
                    await supabase
                        .from("likes")
                        .insert({
                            post_id: postId,
                            user_id: user.id
                        });
                }

                renderUserFeed(containerEl, targetUserId, modalEls);
            };

        });

    /* Открытие модалки по клику на изображение поста */
    if (modalEls) {

        containerEl
            .querySelectorAll(".post-image")
            .forEach(image => {

                image.onclick = () => {

                    const postCard = image.closest(".post");
                    const postId = Number(postCard.dataset.id);

                    const post = posts.find(p => p.id === postId);

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

                    const postImage = postCard.querySelector(".post-image");

                    if (!postImage) return;

                    const commentsHtml = postComments.map(comment => `
                        <div class="comment">
                            <strong>${comment.username}</strong>
                            <span class="comment-time">🕐 ${formatTime(comment.created_at)}</span>
                            <div>${comment.content}</div>
                        </div>
                    `).join("");

                    modalEls.modalImageSide.innerHTML =
                        `<img src="${postImage.src}">`;

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

                    const deleteBtn = document.getElementById("deleteModalPost");

                    if (deleteBtn) {
                        deleteBtn.onclick = async () => {
                            await supabase
                                .from("posts")
                                .delete()
                                .eq("id", postId);

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

                        renderUserFeed(containerEl, targetUserId, modalEls);
                    };

                };

            });

    }

}
