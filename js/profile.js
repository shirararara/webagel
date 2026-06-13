import { supabase }
from "./supabase.js";

const avatar =
document.getElementById(
"avatar"
);

const avatarUrl =
document.getElementById(
"avatarUrl"
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
data: {
user
}
} =
await supabase.auth.getUser();

if(!user){

location.href =
"login.html";

}

const {
data
}
=
await supabase
.from("profiles")
.select("*")
.eq("id",user.id)
.single();

if(data){

username.value =
data.username || "";

bio.value =
data.bio || "";

avatarUrl.value =
data.avatar_url || "";

avatar.src =
data.avatar_url ||
"https://placehold.co/150";

}

saveBtn.onclick =
async ()=>{

const profile = {

id:user.id,

email:user.email,

username:
username.value,

bio:
bio.value,

avatar_url:
avatarUrl.value

};

const {
error
}
=
await supabase
.from("profiles")
.upsert(profile);

if(error){

alert(error.message);

return;

}

alert(
"Сохранено"
);

};

