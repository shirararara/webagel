import { supabase } from "./supabase.js";

const publishBtn = document.getElementById("publishBtn");
const postImage = document.getElementById("postImage");
const postText = document.getElementById("postText");
const feed = document.getElementById("feed");

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

    const previewComments =
        postComments.slice(0, 3);

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

            <img
            src="${post.avatar_url || 'https://placehold.co/50'}"
            width="50"
            height="50">

            <strong>
                ${post.username || "Unknown"}
            </strong>

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

        <br><br>

        <button
        class="likeBtn"
        data-id="${post.id}">

            ${isLiked ? "❤️" : "🤍"}

            ${likesCount}

        </button>

        <br><br>

        <div class="comments-header">
            💬 Комментарии (${commentsCount})
        </div>

        <div class="comment-form">

            <input
                class="commentInput"
                data-id="${post.id}"
                placeholder="Написать комментарий">

            <button
                class="commentBtn"
                data-id="${post.id}">
                Отправить
            </button>

        </div>

        <div class="comments">

            ${previewComments.map(comment => `
                <div class="comment">

                    <strong>
                        ${comment.username}
                    </strong>

                    <span>
                        ${comment.content}
                    </span>

                </div>
            `).join("")}

            ${
                postComments.length > 3
                ?
                `<div class="more-comments">
                    Еще ${postComments.length - 3} комментариев...
                </div>`
                :
                ""
            }

        </div>

        <br><br>

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
    .querySelectorAll(".post")
    .forEach(postCard=>{

        postCard.onclick = ()=>{

            const image =
                postCard.querySelector(
                    ".post-image"
                );

            if(!image){

                return;

            }

            document
            .getElementById(
                "modalImageSide"
            )
            .innerHTML =

            `<img src="${image.src}">`;

            document
            .getElementById(
                "modalInfoSide"
            )
            .innerHTML =

            postCard.innerHTML;

            document
            .getElementById(
                "postModal"
            )
            .style.display =
                "flex";

        };

    });

document
    .getElementById(
        "postModal"
    )
    .onclick = ()=>{

        document
        .getElementById(
            "postModal"
        )
        .style.display =
            "none";

    };

}

publishBtn.onclick = async () => {


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

const profile =
    profileResult.data;

let imageUrl = null;

if (postImage.files.length > 0) {

    const file =
        postImage.files[0];

    const extension =
        file.name.split(".").pop();

    const fileName =
        `${Date.now()}.${extension}`;

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

    imageUrl =
        data.publicUrl;

}

const insertResult =
    await supabase
        .from("posts")
        .insert({

            user_id:
                user.id,

            username:
                profile.username,

            avatar_url:
                profile.avatar_url,

            content:
                postText.value,

            image_url:
                imageUrl

        });

if (insertResult.error) {

    alert(insertResult.error.message);

    return;

}

postText.value = "";
postImage.value = "";

await loadFeed();


};

loadFeed();
