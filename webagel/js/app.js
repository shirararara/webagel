import { supabase }
from "./supabase.js";

const logoutBtn =
document.getElementById(
"logoutBtn"
);

const {
data
} =
await supabase.auth.getUser();

if(
!data.user
){
location.href =
"login.html";
}

logoutBtn.onclick =
async ()=>{

await supabase.auth.signOut();

location.href =
"login.html";

};