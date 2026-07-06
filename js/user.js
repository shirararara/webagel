import { supabase } from "./supabase.js";
import { renderUserFeed } from "./feed.js";
import {
    getFollowersCount,
    getFollowingCount,
    isFollowing,
    followUser,
    unfollowUser
} from "./follows.js";

const params = new URLSearchParams(location.search);
const targetUserId = params.get("id");

if (!targetUserId) {
    location.href = "index.html";
}

const {
    data: { user: currentUser }
} = await supabase.auth.getUser();

if (!currentUser) {
    location.href = "login.html";
}

/* Если пользователь открыл свой же профиль через user.html — отправим на profile.html */
if (currentUser && currentUser.id === targetUserId) {
    location.href = "profile.html";
}

const avatar = document.getElementById("avatar");
const usernameDisplay = document.getElementById("usernameDisplay");
const bioDisplay = document.getElementById("bioDisplay");
const followBtn = document.getElementById("followBtn");
const followersCountEl = document.getElementById("followersCount");
const followingCountEl = document.getElementById("followingCount");
const pageTitle = document.getElementById("pageTitle");

/*
Загрузка данных профиля
*/

const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .maybeSingle();

if (profileError || !profile) {

    pageTitle.textContent = "Пользователь не найден";
    usernameDisplay.textContent = "";
    bioDisplay.textContent = "Такого профиля не существует";
    followBtn.style.display = "none";

} else {

    pageTitle.textContent = "Профиль";
    usernameDisplay.textContent = profile.username || "Без имени";
    bioDisplay.textContent = profile.bio || "";

    if (profile.avatar_url) {
        avatar.src = profile.avatar_url;
    }

    /*
    Счётчики подписчиков / подписок
    */

    async function loadFollowStats() {

        const followers = await getFollowersCount(targetUserId);
        const following = await getFollowingCount(targetUserId);

        followersCountEl.textContent = `${followers} подписчиков`;
        followingCountEl.textContent = `${following} подписок`;

    }

    await loadFollowStats();

    /*
    Кнопка подписки
    */

    async function refreshFollowButton() {

        const following = await isFollowing(currentUser.id, targetUserId);

        followBtn.textContent = following
            ? "Отписаться"
            : "Подписаться";

        followBtn.classList.toggle("following", following);

    }

    await refreshFollowButton();

    followBtn.onclick = async () => {

        followBtn.disabled = true;

        const currentlyFollowing = followBtn.classList.contains("following");

        const { error } = currentlyFollowing
            ? await unfollowUser(currentUser.id, targetUserId)
            : await followUser(currentUser.id, targetUserId);

        if (error) {
            alert(error.message);
            followBtn.disabled = false;
            return;
        }

        await refreshFollowButton();
        await loadFollowStats();

        followBtn.disabled = false;

    };

    /*
    Лента публикаций пользователя
    */

    const feed = document.getElementById("feed");
    const postModal = document.getElementById("postModal");
    const modalImageSide = document.getElementById("modalImageSide");
    const modalInfoSide = document.getElementById("modalInfoSide");

    renderUserFeed(
        feed,
        targetUserId,
        { postModal, modalImageSide, modalInfoSide }
    );

    postModal.onclick = () => {
        const video = modalImageSide?.querySelector("video");
        if (video) { video.pause(); video.currentTime = 0; }
        postModal.style.display = "none";
    };

    modalImageSide?.addEventListener("click", e => e.stopPropagation());
    modalInfoSide?.addEventListener("click", e => e.stopPropagation());

}
