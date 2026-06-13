import { createClient }
from "https://esm.sh/@supabase/supabase-js";

const SUPABASE_URL =
"https://gbdboswbigpwidwocycw.supabase.co/rest/v1/";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZGJvc3diaWdwd2lkd29jeWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNzUyMzMsImV4cCI6MjA5Njk1MTIzM30.qKcBYWtCa73bXtmra9lfibfoJ-NFpruBvLuTw62Q-n4";

export const supabase =
createClient(
SUPABASE_URL,
SUPABASE_KEY
);