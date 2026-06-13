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
        data: { user }
    } = await supabase.auth.getUser();

    feed.innerHTML = "";

    posts.forEach(post => {

        const canDelete =
            user &&
            user.id === post.user_id;

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
                src="${post.image_url}"
                width="500">`
                :
                ""
            }

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

}

publishBtn.onclick = async () => {

    console.log("Кнопка нажата");

    const {
        data: { user }
    } = await supabase.auth.getUser();

    console.log("USER:", user);

    if (!user) {

        alert("Пользователь не найден");

        return;

    }

    const profileResult = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

    console.log("PROFILE:", profileResult);

    if (profileResult.error) {

        alert(profileResult.error.message);

        return;

    }

    const profile = profileResult.data;

    let imageUrl = null;

    if (postImage.files.length > 0) {

        const file = postImage.files[0];

        const extension = file.name.split(".").pop();

        const fileName =
            `${Date.now()}.${extension}`;

        const uploadResult =
            await supabase.storage
                .from("posts")
                .upload(fileName, file);

        console.log("UPLOAD:", uploadResult);

        if (uploadResult.error) {

            alert(uploadResult.error.message);

            return;

        }

        const { data } =
            supabase.storage
                .from("posts")
                .getPublicUrl(fileName);

        imageUrl = data.publicUrl;

        console.log("IMAGE URL:", imageUrl);

    }

    const insertResult =
        await supabase
            .from("posts")
            .insert({

                user_id: user.id,

                username:
                    profile.username,

                avatar_url:
                    profile.avatar_url,

                content:
                    postText.value,

                image_url:
                    imageUrl

            })
            .select();

    console.log("INSERT RESULT:", insertResult);

    if (insertResult.error) {

        alert(insertResult.error.message);

        return;

    }

    alert("Пост создан");

    postText.value = "";
    postImage.value = "";

    await loadFeed();

};

loadFeed();
