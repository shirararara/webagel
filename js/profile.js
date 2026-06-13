import { supabase }
from "./supabase.js";

const avatar =
document.getElementById(
"avatar"
);

const avatarFile =
document.getElementById(
"avatarFile"
);

const username =
document.getElementById(
"username"
);

const bio =
document.getElementById(
"bio"
);

const saveBtn =
document.getElementById(
"saveBtn"
);

const {
data: { user }
} =
await supabase.auth.getUser();

if (!user) {

location.href =
"login.html";

}

let currentAvatar = "";

/*
Загрузка профиля
*/

const {
data: profile
}
=
await supabase
.from("profiles")
.select("*")
.eq("id", user.id)
.maybeSingle();

if (profile) {

username.value =
profile.username || "";

bio.value =
profile.bio || "";

currentAvatar =
profile.avatar_url || "";

if (currentAvatar) {

avatar.src =
currentAvatar;

}

}

/*
Предпросмотр изображения
*/

avatarFile.onchange =
() => {

const file =
avatarFile.files[0];

if (!file) return;

avatar.src =
URL.createObjectURL(file);

};

/*
Сохранение профиля
*/

saveBtn.onclick =
async () => {

let avatarUrl =
currentAvatar;

/*
Загрузка нового аватара
*/

if (
avatarFile.files.length > 0
) {

const file =
avatarFile.files[0];

const extension =
file.name
.split(".")
.pop();

const fileName =
`${user.id}.${extension}`;

const {
error: uploadError
}
=
await supabase.storage
.from("avatars")
.upload(
fileName,
file,
{
upsert: true
}
);

if (uploadError) {

alert(
uploadError.message
);

return;

}

const {
data
}
=
supabase.storage
.from("avatars")
.getPublicUrl(
fileName
);

avatarUrl =
data.publicUrl;

}

/*
Сохранение профиля
*/

const {
error
}
=
await supabase
.from("profiles")
.upsert({

id: user.id,

email: user.email,

username:
username.value,

bio:
bio.value,

avatar_url:
avatarUrl

});

if (error) {

alert(error.message);

return;

}

alert(
"Профиль сохранён"
);

};
