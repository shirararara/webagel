import { supabase } from "./supabase.js";

const feed = document.getElementById("feed");

// Create post modal
const publishFloatBtn = document.getElementById("publishFloatBtn");
const createPostModal = document.getElementById("createPostModal");
const cancelPostBtn   = document.getElementById("cancelPostBtn");

function openCreateModal() {
    document.getElementById("postText").value = "";
    document.getElementById("postImage").value = "";
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<span id="imageDropHint">📷 Нажмите, чтобы добавить фото</span>`;
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

document.getElementById("postImage").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const preview = document.getElementById("imagePreview");
    preview.innerHTML = `<img src="${url}">`;
});

async function loadFeed() {


const {
    data: posts,
    error
} = await supabase
    .from("posts")
    .select("*")
    .order("created_at", {
        ascending: false
    });

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

feed.innerHTML = "";

posts.forEach(post => {

    const canDelete =
        currentUser &&
        currentUser.id === post.user_id;

    const postLikes =
        likesData.filter(
            like =>
            like.post_id === post.id
        );

    const postComments =
        commentsData.filter(
            comment =>
            comment.post_id === post.id
        );

    const commentsCount =
        postComments.length;

    const likesCount =
        postLikes.length;

    const isLiked =
        currentUser &&
        postLikes.some(
            like =>
            like.user_id === currentUser.id
    );

    feed.innerHTML += `

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

        </div>

        <p>
            ${post.content || ""}
        </p>

        ${
            post.image_url
            ?
            `<img
            class="post-image"
            src="${post.image_url}">`
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
            `<button class="deletePostBtn">
                🗑 Удалить
            </button>`
            :
            ""
        }

        <hr>

    </div>

    `;

});

document
    .querySelectorAll(".deletePostBtn")
    .forEach(button => {

        button.onclick =
        async (event) => {

            const postElement =
                event.target.closest(".post");

            const postId =
                postElement.dataset.id;

            if (
                !confirm(
                    "Удалить пост?"
                )
            ) {
                return;
            }

            await supabase
                .from("likes")
                .delete()
                .eq("post_id", postId);

            await supabase
                .from("comments")
                .delete()
                .eq("post_id", postId);

            const {
                error
            } =
            await supabase
                .from("posts")
                .delete()
                .eq("id", postId);

            if (error) {

                alert(error.message);

                return;

            }

            loadFeed();

        };

    });

document
    .querySelectorAll(".likeBtn")
    .forEach(button => {

        button.onclick =
        async () => {

            const postId =
                Number(
                    button.dataset.id
                );

            const {
                data:{user}
            } =
            await supabase.auth
                .getUser();

            if(!user){

                alert(
                    "Войдите в аккаунт"
                );

                return;

            }

            const {
                data: existingLike
            } =
            await supabase
                .from("likes")
                .select("*")
                .eq(
                    "post_id",
                    postId
                )
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();

            if(existingLike){

                await supabase
                    .from("likes")
                    .delete()
                    .eq(
                        "post_id",
                        postId
                    )
                    .eq(
                        "user_id",
                        user.id
                    );

            } else {

                await supabase
                    .from("likes")
                    .insert({

                        post_id:
                            postId,

                        user_id:
                            user.id

                    });

            }

            loadFeed();

        };

    });

document
    .querySelectorAll(".commentBtn")
    .forEach(button => {

        button.onclick =
        async () => {

            const postId =
                Number(
                    button.dataset.id
                );

            const input =
                document.querySelector(
                    `.commentInput[data-id="${postId}"]`
                );

            const text =
                input.value.trim();

            if(!text){
                return;
            }

            const {
                data:{user}
            } =
            await supabase.auth
                .getUser();

            if(!user){
                alert("Войдите в аккаунт");
                return;
            }

            const {
                data: profile
            } =
            await supabase
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .single();

            const result = 
                await supabase
                    .from("comments")
                    .insert({

                        post_id: postId,
                        user_id: user.id,
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                        content: text

                    });

            if(result.error){

                alert(result.error.message);

                return;

            }

            loadFeed();

        };

    });

document
    .querySelectorAll(".post-image")
    .forEach(image => {

        image.onclick = () => {

            const postCard =
                image.closest(".post");

            const postId =
                Number(
                    postCard.dataset.id
                );

            const post =
                posts.find(
                    p => p.id === postId
                );

            const postComments =
                commentsData.filter(
                    comment =>
                    comment.post_id === postId
                );

            const postLikes =
                likesData.filter(
                    like =>
                    like.post_id === postId
                );

            const commentsCount =
                postComments.length;

            const likesCount =
                postLikes.length;

            const postImage =
                postCard.querySelector(
                    ".post-image"
                );

            if (!postImage) {
                return;
            }

            const commentsHtml =
                postComments.map(comment => `

                    <div class="comment">

                        <strong>
                            ${comment.username}
                        </strong>

                        <div>
                            ${comment.content}
                        </div>

                    </div>

                `).join("");

            document
                .getElementById(
                    "modalImageSide"
                )
                .innerHTML =
                `<img src="${postImage.src}">`;

            document
                .getElementById(
                    "modalInfoSide"
                )
                .innerHTML = `

                    <h2>
                        <a href="user.html?id=${post.user_id}" class="modal-author-link">
                            ${post.username}
                        </a>
                    </h2>

                    <p>
                        ${post.content || ""}
                    </p>

                    <hr>

                    <div class="post-stats">

                        ❤️ ${likesCount}

                        &nbsp;&nbsp;

                        💬 ${commentsCount}

                    </div>

                    <h3>
                        Комментарии
                    </h3>

                    <div class="comments">

                        ${commentsHtml}

                    </div>

                    <hr>

                    <div class="comment-form">

                        <input
                            id="modalCommentInput"
                            placeholder="Написать комментарий">

                        <button
                            id="modalCommentBtn">

                            Отправить

                        </button>

                    </div>

                    ${
                        currentUser &&
                        currentUser.id === post.user_id
                        ?
                        `
                        <button
                            id="deleteModalPost">

                            🗑 Удалить пост

                        </button>
                        `
                        :
                        ""
                    }

                `;

            document
                .getElementById(
                    "postModal"
                )
                .style.display =
                "flex";

            const deleteBtn =
                document.getElementById(
                    "deleteModalPost"
                );

            if(deleteBtn){

                deleteBtn.onclick =
                async ()=>{

                    await supabase
                        .from("likes")
                        .delete()
                        .eq("post_id", postId);

                    await supabase
                        .from("comments")
                        .delete()
                        .eq("post_id", postId);

                    await supabase
                        .from("posts")
                        .delete()
                        .eq(
                            "id",
                            postId
                        );

                    document
                        .getElementById(
                            "postModal"
                        )
                        .style.display =
                        "none";

                    loadFeed();

                };

            }

            document
            .getElementById(
                "modalCommentBtn"
            )
            .onclick = async () => {

                const text =
                    document
                    .getElementById(
                        "modalCommentInput"
                    )
                    .value
                    .trim();

                if(!text){
                    return;
                }

                const {
                    data:{user}
                } =
                await supabase.auth.getUser();

                const {
                    data:profile
                } =
                await supabase
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

                loadFeed();

            };

        };

    });
const postModal =
    document.getElementById("postModal");

postModal.onclick = () => {
    postModal.style.display = "none";
};

// Prevent clicks inside the modal content from closing the modal
postModal
    .querySelector("#modalImageSide")
    ?.addEventListener("click", e => e.stopPropagation());

postModal
    .querySelector("#modalInfoSide")
    ?.addEventListener("click", e => e.stopPropagation());

}

document.getElementById("publishBtn").onclick = async () => {

const postImage = document.getElementById("postImage");
const postText  = document.getElementById("postText");

const {
    data: { user }
} = await supabase.auth.getUser();

if (!user) {
    alert("Нужно войти");
    return;
}

const profileResult =
    await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

if (profileResult.error) {
    alert(profileResult.error.message);
    return;
}

const profile = profileResult.data;

let imageUrl = null;

if (postImage.files.length > 0) {

    const file      = postImage.files[0];
    const extension = file.name.split(".").pop();
    const fileName  = `${Date.now()}.${extension}`;

    const uploadResult =
        await supabase.storage
            .from("posts")
            .upload(fileName, file);

    if (uploadResult.error) {
        alert(uploadResult.error.message);
        return;
    }

    const { data } =
        supabase.storage
            .from("posts")
            .getPublicUrl(fileName);

    imageUrl = data.publicUrl;

}

const insertResult =
    await supabase
        .from("posts")
        .insert({
            user_id:    user.id,
            username:   profile.username,
            avatar_url: profile.avatar_url,
            content:    postText.value,
            image_url:  imageUrl
        });

if (insertResult.error) {
    alert(insertResult.error.message);
    return;
}

closeCreateModal();
await loadFeed();

};

loadFeed();
