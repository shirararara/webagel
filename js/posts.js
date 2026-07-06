import { supabase } from "./supabase.js";
import { notifyLike, removeLikeNotification, notifyComment, removeNotificationsForPost } from "./notifications.js";
import { fetchViewsForPosts, observeViews } from "./views.js";

// ===== ФОРМАТИРОВАНИЕ ВРЕМЕНИ =====
function formatTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // секунды

    if (diff < 60)             return "только что";
    if (diff < 3600)           return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400)          return `${Math.floor(diff / 3600)} ч. назад`;
    if (diff < 86400 * 7)      return `${Math.floor(diff / 86400)} д. назад`;

    return date.toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

const feed = document.getElementById("feed");

// Create post modal
const publishFloatBtn = document.getElementById("publishFloatBtn");
const createPostModal = document.getElementById("createPostModal");
const cancelPostBtn   = document.getElementById("cancelPostBtn");

function openCreateModal() {
    document.getElementById("postText").value = "";
    document.getElementById("postImage").value = "";
    document.getElementById("postVideo").value = "";
    document.getElementById("postAdultContent").checked = false;
    setMediaType("photo");
    createPostModal.style.display = "flex";
}

function closeCreateModal() {
    createPostModal.style.display = "none";
}

publishFloatBtn.addEventListener("click", openCreateModal);
cancelPostBtn.addEventListener("click", closeCreateModal);

createPostModal.addEventListener("click", (e) => {
    if (e.target === createPostModal) closeCreateModal();
});

// ===== MEDIA TYPE TOGGLE (Фото / Видео) =====
const postImageInput = document.getElementById("postImage");
const postVideoInput = document.getElementById("postVideo");
const mediaTypePhotoBtn = document.getElementById("mediaTypePhoto");
const mediaTypeVideoBtn = document.getElementById("mediaTypeVideo");
let currentMediaType = "photo";

function setMediaType(type) {
    currentMediaType = type;
    postImageInput.value = "";
    postVideoInput.value = "";

    const preview = document.getElementById("imagePreview");

    if (type === "video") {
        mediaTypeVideoBtn.classList.add("active");
        mediaTypePhotoBtn.classList.remove("active");
        postImageInput.style.display = "none";
        postVideoInput.style.display = "";
        preview.innerHTML = `<span id="imageDropHint">🎬 Нажмите, чтобы добавить видео</span>`;
    } else {
        mediaTypePhotoBtn.classList.add("active");
        mediaTypeVideoBtn.classList.remove("active");
        postImageInput.style.display = "";
        postVideoInput.style.display = "none";
        preview.innerHTML = `<span id="imageDropHint">📷 Нажмите, чтобы добавить фото</span>`;
    }
}

mediaTypePhotoBtn.addEventListener("click", () => setMediaType("photo"));
mediaTypeVideoBtn.addEventListener("click", () => setMediaType("video"));

document.getElementById("imageDropZone").addEventListener("click", (e) => {
    if (e.target.closest(".mediaTypeBtn")) return;
    if (e.target.tagName === "INPUT") return;
    (currentMediaType === "video" ? postVideoInput : postImageInput).click();
});

postImageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<img src="${url}">`;
});

postVideoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<video src="${url}" controls autoplay muted loop></video>`;
});

// ===== STATE =====
let allPosts      = [];
let allLikes      = [];
let allComments   = [];
let allViews      = [];
let currentUser   = null;
let followingIds  = new Set();

function viewsCountFor(postId) {
    return allViews.filter(v => v.post_id === postId).length;
}

// ===== DROPDOWNS =====
const filterBtn    = document.getElementById("filterBtn");
const filterMenu   = document.getElementById("filterMenu");
const sortBtn      = document.getElementById("sortBtn");
const sortMenu     = document.getElementById("sortMenu");

function toggleDropdown(menu, btn) {
    const isOpen = menu.classList.contains("open");
    // Close all
    filterMenu.classList.remove("open");
    sortMenu.classList.remove("open");
    filterBtn.classList.remove("active");
    sortBtn.classList.remove("active");
    if (!isOpen) {
        menu.classList.add("open");
        btn.classList.add("active");
    }
}

filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(filterMenu, filterBtn);
});

sortBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown(sortMenu, sortBtn);
});

document.addEventListener("click", () => {
    filterMenu.classList.remove("open");
    sortMenu.classList.remove("open");
    filterBtn.classList.remove("active");
    sortBtn.classList.remove("active");
});

filterMenu.addEventListener("click", (e) => e.stopPropagation());
sortMenu.addEventListener("click",   (e) => e.stopPropagation());

// Mutual exclusion: Только GIF <-> Без GIF
document.getElementById("filterOnlyGif").addEventListener("change", (e) => {
    if (e.target.checked) document.getElementById("filterNoGif").checked = false;
    applyAndRender();
});
document.getElementById("filterNoGif").addEventListener("change", (e) => {
    if (e.target.checked) document.getElementById("filterOnlyGif").checked = false;
    applyAndRender();
});
document.getElementById("filterFollowing").addEventListener("change", applyAndRender);
document.getElementById("filterHideOwn").addEventListener("change", applyAndRender);
document.querySelectorAll('input[name="sortOrder"]').forEach(r => r.addEventListener("change", applyAndRender));

// ===== SEARCH =====
const searchInput = document.getElementById("mainSearchInput");
searchInput.addEventListener("input", applyAndRender);

// ===== FILTER + SORT + SEARCH LOGIC =====
function applyAndRender() {
    const query         = searchInput.value.trim().toLowerCase();
    const onlyFollowing = document.getElementById("filterFollowing").checked;
    const onlyGif       = document.getElementById("filterOnlyGif").checked;
    const noGif         = document.getElementById("filterNoGif").checked;
    const hideOwn       = document.getElementById("filterHideOwn").checked;
    const sortVal       = document.querySelector('input[name="sortOrder"]:checked').value;

    let filtered = allPosts.slice();

    // Search
    if (query) {
        filtered = filtered.filter(post =>
            (post.content || "").toLowerCase().includes(query) ||
            (post.username || "").toLowerCase().includes(query)
        );
    }

    // Filter: only following
    if (onlyFollowing) {
        filtered = filtered.filter(post => followingIds.has(post.user_id));
    }

    // Filter: hide own posts
    if (hideOwn && currentUser) {
        filtered = filtered.filter(post => post.user_id !== currentUser.id);
    }

    // Filter: GIF
    if (onlyGif) {
        filtered = filtered.filter(post => post.image_url && post.image_url.toLowerCase().endsWith(".gif"));
    } else if (noGif) {
        filtered = filtered.filter(post => !post.image_url || !post.image_url.toLowerCase().endsWith(".gif"));
    }

    // Sort
    filtered.sort((a, b) => {
        const aLikes    = (allLikes.filter(l => l.post_id === a.id)).length;
        const bLikes    = (allLikes.filter(l => l.post_id === b.id)).length;
        const aComments = (allComments.filter(c => c.post_id === a.id)).length;
        const bComments = (allComments.filter(c => c.post_id === b.id)).length;
        const aViews    = viewsCountFor(a.id);
        const bViews    = viewsCountFor(b.id);
        const aDate     = new Date(a.created_at);
        const bDate     = new Date(b.created_at);

        switch (sortVal) {
            case "newest":        return bDate - aDate;
            case "oldest":        return aDate - bDate;
            case "most_likes":    return bLikes - aLikes;
            case "least_likes":   return aLikes - bLikes;
            case "most_comments": return bComments - aComments;
            case "least_comments":return aComments - bComments;
            case "most_views":    return bViews - aViews;
            case "least_views":   return aViews - bViews;
            default:              return bDate - aDate;
        }
    });

    renderPosts(filtered);
}

// ===== RENDER =====
function renderPosts(posts) {
    feed.innerHTML = "";

    if (!posts || posts.length === 0) {
        feed.innerHTML = `<p class="empty-feed">Публикаций не найдено</p>`;
        return;
    }

    posts.forEach(post => {

        const canDelete = currentUser && currentUser.id === post.user_id;

        const postLikes    = allLikes.filter(l => l.post_id === post.id);
        const postComments = allComments.filter(c => c.post_id === post.id);
        const likesCount   = postLikes.length;
        const commentsCount = postComments.length;
        const isLiked      = currentUser && postLikes.some(l => l.user_id === currentUser.id);

        feed.innerHTML += `
        <div class="post" data-id="${post.id}">
            <div>
                <a href="user.html?id=${post.user_id}" class="post-author-link" onclick="event.stopPropagation()">
                    <img src="${post.avatar_url || 'https://placehold.co/50'}" width="50" height="50">
                    <strong>${post.username || "Unknown"}</strong>
                </a>
                <span class="post-time">🕐 ${formatTime(post.created_at)}</span>
            </div>
            <p>${post.content || ""}</p>
            ${(() => {
                if (!post.video_url && !post.image_url) return "";
                const mediaTag = post.video_url
                    ? `<div class="video-thumb">
                        <video class="post-video" src="${post.video_url}" preload="metadata" playsinline oncontextmenu="return false;"></video>
                        <span class="video-play-badge">▶</span>
                    </div>`
                    : `<img class="post-image" src="${post.image_url}">`;
                if (!post.is_adult) return mediaTag;
                return `<div class="post-media-wrapper blurred">
                    ${mediaTag}
                    <div class="adult-overlay">
                        <span class="adult-badge">18+</span>
                        <span class="adult-hint">Нажмите, чтобы посмотреть</span>
                    </div>
                </div>`;
            })()}
            <div class="post-stats">
                <button class="likeBtn" data-id="${post.id}">
                    ${isLiked ? "❤️" : "🤍"} ${likesCount}
                </button>
                <span class="post-comments-open" data-id="${post.id}">💬 ${commentsCount}</span>
                <span class="post-views">👁 ${viewsCountFor(post.id)}</span>
            </div>
            <br>
            ${canDelete ? `<button class="deletePostBtn">🗑 Удалить</button>` : ""}
            <hr>
        </div>`;
    });

    // Счёт просмотров: засчитываем, когда карточка реально показалась
    // пользователю (не сразу при рендере списка).
    observeViews(feed, posts, currentUser, (postId) => {
        allViews.push({ post_id: postId });
        const span = feed.querySelector(`.post[data-id="${postId}"] .post-views`);
        if (span) span.textContent = `👁 ${viewsCountFor(postId)}`;
    });

    // Delete buttons
    feed.querySelectorAll(".deletePostBtn").forEach(button => {
        button.onclick = async (event) => {
            const postElement = event.target.closest(".post");
            const postId      = postElement.dataset.id;
            if (!confirm("Удалить пост?")) return;

            await supabase.from("likes").delete().eq("post_id", postId);
            await supabase.from("comments").delete().eq("post_id", postId);
            const { error } = await supabase.from("posts").delete().eq("id", postId);
            if (error) { alert(error.message); return; }
            await removeNotificationsForPost(postId);

            await loadFeed();
        };
    });

    // Like buttons
    feed.querySelectorAll(".likeBtn").forEach(button => {
        button.onclick = async () => {
            const postId = Number(button.dataset.id);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { alert("Войдите в аккаунт"); return; }

            const post = allPosts.find(p => p.id === postId);

            const { data: existingLike } = await supabase
                .from("likes").select("*")
                .eq("post_id", postId).eq("user_id", user.id).maybeSingle();

            if (existingLike) {
                await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", user.id);
                if (post) await removeLikeNotification(post.user_id, user.id, postId);
            } else {
                await supabase.from("likes").insert({ post_id: postId, user_id: user.id });
                if (post) await notifyLike(post.user_id, user.id, postId);
            }

            await loadFeed();
        };
    });

    // Post detail modal (comments, likes, full view)
    function openPostDetailModal(postId) {
            const post = allPosts.find(p => p.id === postId);
            if (!post) return;

            const postComments = allComments.filter(c => c.post_id === postId);
            const postLikes    = allLikes.filter(l => l.post_id === postId);
            const likesCount   = postLikes.length;
            const commentsCount = postComments.length;

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
            document.getElementById("modalImageSide").innerHTML = post.is_adult
                ? `<div class="post-media-wrapper blurred">
                    ${mediaTag}
                    <div class="adult-overlay">
                        <span class="adult-badge">18+</span>
                        <span class="adult-hint">Нажмите, чтобы посмотреть</span>
                    </div>
                </div>`
                : mediaTag;
            document.getElementById("modalInfoSide").innerHTML = `
                <h2>
                    <a href="user.html?id=${post.user_id}" class="modal-author-link">${post.username}</a>
                </h2>
                <div class="post-time">🕐 ${formatTime(post.created_at)}</div>
                <p>${post.content || ""}</p>
                <hr>
                <div class="post-stats">❤️ ${likesCount} &nbsp;&nbsp; 💬 ${commentsCount} &nbsp;&nbsp; 👁 ${viewsCountFor(postId)}</div>
                <h3>Комментарии</h3>
                <div class="comments">${commentsHtml}</div>
                <hr>
                <div class="comment-form">
                    <input id="modalCommentInput" placeholder="Написать комментарий">
                    <button id="modalCommentBtn">Отправить</button>
                </div>
                ${currentUser && currentUser.id === post.user_id
                    ? `<button id="deleteModalPost">🗑 Удалить пост</button>`
                    : ""}
            `;

            document.getElementById("postModal").style.display = "flex";

            const modalOverlay = document.querySelector("#modalImageSide .adult-overlay");
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
                    await supabase.from("likes").delete().eq("post_id", postId);
                    await supabase.from("comments").delete().eq("post_id", postId);
                    await supabase.from("posts").delete().eq("id", postId);
                    await removeNotificationsForPost(postId);
                    document.getElementById("postModal").style.display = "none";
                    await loadFeed();
                };
            }

            document.getElementById("modalCommentBtn").onclick = async () => {
                const text = document.getElementById("modalCommentInput").value.trim();
                if (!text) return;
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) { alert("Войдите в аккаунт"); return; }
                const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
                await supabase.from("comments").insert({
                    post_id: postId, user_id: user.id,
                    username: profile.username, avatar_url: profile.avatar_url, content: text
                });
                await notifyComment(post.user_id, user.id, postId, text);
                await loadFeed();
            };
    }

    feed.querySelectorAll(".post-image, .post-video, .post-comments-open").forEach(el => {
        el.onclick = () => {
            const postCard = el.closest(".post");
            const postId   = Number(postCard.dataset.id);
            openPostDetailModal(postId);
        };
    });

    // 18+ overlay: first click just removes the blur, doesn't open the modal
    feed.querySelectorAll(".adult-overlay").forEach(overlay => {
        overlay.onclick = (e) => {
            e.stopPropagation();
            overlay.closest(".post-media-wrapper").classList.remove("blurred");
            overlay.remove();
        };
    });

    const postModal = document.getElementById("postModal");
    postModal.onclick = () => { postModal.style.display = "none"; };
    postModal.querySelector("#modalImageSide")?.addEventListener("click", e => e.stopPropagation());
    postModal.querySelector("#modalInfoSide")?.addEventListener("click",  e => e.stopPropagation());
}

// ===== LOAD FEED =====
async function loadFeed() {
    const { data: posts, error } = await supabase
        .from("posts").select("*").order("created_at", { ascending: false });

    if (error) { console.error(error); return; }

    const { data: likesData }    = await supabase.from("likes").select("*");
    const { data: commentsData } = await supabase.from("comments").select("*");
    const { data: { user } }     = await supabase.auth.getUser();

    allPosts    = posts    || [];
    allLikes    = likesData    || [];
    allComments = commentsData || [];
    allViews    = await fetchViewsForPosts(allPosts.map(p => p.id));
    currentUser = user;

    // Load following list
    followingIds = new Set();
    if (currentUser) {
        const { data: followsData } = await supabase
            .from("follows").select("following_id").eq("follower_id", currentUser.id);
        (followsData || []).forEach(f => followingIds.add(f.following_id));
    }

    applyAndRender();
}

// ===== PUBLISH =====
document.getElementById("publishBtn").onclick = async () => {
    const postText = document.getElementById("postText");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Нужно войти"); return; }

    const profileResult = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (profileResult.error) { alert(profileResult.error.message); return; }
    const profile = profileResult.data;

    let imageUrl = null;
    let videoUrl = null;

    if (currentMediaType === "video" && postVideoInput.files.length > 0) {
        const file      = postVideoInput.files[0];
        const extension = file.name.split(".").pop();
        const fileName  = `${Date.now()}.${extension}`;
        const uploadResult = await supabase.storage.from("posts").upload(fileName, file);
        if (uploadResult.error) { alert(uploadResult.error.message); return; }
        const { data } = supabase.storage.from("posts").getPublicUrl(fileName);
        videoUrl = data.publicUrl;
    } else if (currentMediaType === "photo" && postImageInput.files.length > 0) {
        const file      = postImageInput.files[0];
        const extension = file.name.split(".").pop();
        const fileName  = `${Date.now()}.${extension}`;
        const uploadResult = await supabase.storage.from("posts").upload(fileName, file);
        if (uploadResult.error) { alert(uploadResult.error.message); return; }
        const { data } = supabase.storage.from("posts").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
    }

    const insertResult = await supabase.from("posts").insert({
        user_id:    user.id,
        username:   profile.username,
        avatar_url: profile.avatar_url,
        content:    postText.value,
        image_url:  imageUrl,
        video_url:  videoUrl,
        is_adult:   document.getElementById("postAdultContent").checked
    });

    if (insertResult.error) { alert(insertResult.error.message); return; }

    closeCreateModal();
    await loadFeed();
};

loadFeed();
