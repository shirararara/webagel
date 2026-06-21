import { supabase } from "./supabase.js";

const userSearchInput = document.getElementById("userSearchInput");
const userResults = document.getElementById("userResults");

const {
    data: { user: currentUser }
} = await supabase.auth.getUser();

function renderUsers(users) {

    userResults.innerHTML = "";

    if (!users || users.length === 0) {
        userResults.innerHTML = `<p class="empty-feed">Никого не найдено</p>`;
        return;
    }

    users.forEach(profile => {

        const isSelf =
            currentUser && currentUser.id === profile.id;

        const link =
            isSelf ? "profile.html" : `user.html?id=${profile.id}`;

        userResults.innerHTML += `

        <a href="${link}" class="user-card">

            <img
                src="${profile.avatar_url || 'https://placehold.co/80'}"
                class="user-card-avatar"
                width="60"
                height="60">

            <div class="user-card-info">
                <strong>${profile.username || "Без имени"}</strong>
                <p>${profile.bio ? profile.bio.slice(0, 80) : ""}</p>
            </div>

        </a>

        `;

    });

}

async function loadUsers(query) {

    let request = supabase
        .from("profiles")
        .select("*")
        .order("username", { ascending: true })
        .limit(40);

    if (query) {
        request = request.ilike("username", `%${query}%`);
    }

    const { data, error } = await request;

    if (error) {
        console.error(error);
        return;
    }

    renderUsers(data);

}

let debounceTimer = null;

userSearchInput.oninput = () => {

    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        loadUsers(userSearchInput.value.trim());
    }, 250);

};

loadUsers("");
