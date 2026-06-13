import { supabase }
from "./supabase.js";

const registerBtn =
document.getElementById(
"registerBtn"
);

if(registerBtn){

registerBtn.onclick =
async ()=>{

const email =
document
.getElementById("email")
.value;

const password =
document
.getElementById("password")
.value;

const { error } =
await supabase.auth.signUp({

email,
password

});

if(error){

alert(error.message);

return;

}

alert(
"Аккаунт создан"
);

location.href =
"login.html";

};

}

const loginBtn =
document.getElementById(
"loginBtn"
);

if(loginBtn){

loginBtn.onclick =
async ()=>{

const email =
document
.getElementById("email")
.value;

const password =
document
.getElementById("password")
.value;

const { error } =
await supabase.auth.signInWithPassword({

email,
password

});

if(error){

alert(error.message);

return;

}

location.href =
"index.html";

};

}