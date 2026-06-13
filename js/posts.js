import { supabase }
from "./supabase.js";

const publishBtn =
document.getElementById(
"publishBtn"
);

const postImage =
document.getElementById(
"postImage"
);

const postText =
document.getElementById(
"postText"
);

const feed =
document.getElementById(
"feed"
);

/*
Загрузка ленты
*/

async function loadFeed(){

const {
data: posts,
error
}
=
await supabase
.from("posts")
.select("*")
.order(
"created_at",
{
ascending:false
}
);

if(error){

console.error(error);

return;

}

feed.innerHTML = "";

posts.forEach(post=>{

feed.innerHTML += `

<div class="post">

<div>

<img
src="${post.avatar_url || 'https://placehold.co/50'}"
width="50"
height="50">

<strong>

${post.username}

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

<hr>

</div>

`;

});

}

/*
Создание поста
*/

publishBtn.onclick =
async ()=>{

const {
data:{
user
}
}
=
await supabase.auth
.getUser();

if(!user){

alert(
"Нужно войти"
);

return;

}

const {
data: profile
}
=
await supabase
.from("profiles")
.select("*")
.eq(
"id",
user.id
)
.single();

let imageUrl = null;

/*
Загрузка изображения
*/

if(
postImage.files.length > 0
){

const file =
postImage.files[0];

const extension =
file.name
.split(".")
.pop();

const fileName =
`${Date.now()}.${extension}`;

const result =
await supabase.storage
.from("posts")
.upload(
fileName,
file
);

console.log(result);

if(result.error){

alert(result.error.message);

console.error(result.error);

return;

}

return;

}

const {
data
}
=
supabase.storage
.from("posts")
.getPublicUrl(
fileName
);

imageUrl =
data.publicUrl;

}

/*
Создание записи
*/

const {
error
}
=
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

if(error){

alert(
error.message
);

return;

}

postText.value = "";

postImage.value = "";

loadFeed();

};

loadFeed();
