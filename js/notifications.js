import { supabase } from "./supabase.js";

// ===== ФОРМАТИРОВАНИЕ ВРЕМЕНИ =====
function formatTime(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60)        return "только что";
    if (diff < 3600)      return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)} ч. назад`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} д. назад`;

    return date.toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

/*
=====================================================================
СОЗДАНИЕ / УДАЛЕНИЕ УВЕДОМЛЕНИЙ

Лайки и подписки используют "dedupe_key" — уникальный ключ на
(recipient_id, actor_id, dedupe_key). Повторные лайк/дизлайк или
подписка/отписка не плодят новые строки: запись либо обновляется
(upsert), либо удаляется. Поэтому "спама" из одинаковых уведомлений
быть не может — одно действие = максимум одно уведомление, как в
популярных соцсетях.

Комментарии — это всегда новое уникальное событие (разный текст),
поэтому для них создаётся отдельная запись на каждый комментарий.
=====================================================================
*/

export async function notifyLike(recipientId, actorId, postId) {
    if (!recipientId || !actorId || recipientId === actorId) return;

    await supabase.from("notifications").upsert({
        recipient_id: recipientId,
        actor_id:     actorId,
        type:         "like",
        post_id:      postId,
        dedupe_key:   `like:${postId}`,
        is_read:      false,
        created_at:   new Date().toISOString()
    }, { onConflict: "recipient_id,actor_id,dedupe_key" });
}

export async function removeLikeNotification(recipientId, actorId, postId) {
    if (!recipientId || !actorId) return;

    await supabase.from("notifications")
        .delete()
        .eq("recipient_id", recipientId)
        .eq("actor_id", actorId)
        .eq("dedupe_key", `like:${postId}`);
}

export async function notifyFollow(recipientId, actorId) {
    if (!recipientId || !actorId || recipientId === actorId) return;

    await supabase.from("notifications").upsert({
        recipient_id: recipientId,
        actor_id:     actorId,
        type:         "follow",
        dedupe_key:   "follow",
        is_read:      false,
        created_at:   new Date().toISOString()
    }, { onConflict: "recipient_id,actor_id,dedupe_key" });
}

export async function removeFollowNotification(recipientId, actorId) {
    if (!recipientId || !actorId) return;

    await supabase.from("notifications")
        .delete()
        .eq("recipient_id", recipientId)
        .eq("actor_id", actorId)
        .eq("dedupe_key", "follow");
}

export async function notifyComment(recipientId, actorId, postId, text) {
    if (!recipientId || !actorId || recipientId === actorId) return;

    await supabase.from("notifications").insert({
        recipient_id: recipientId,
        actor_id:     actorId,
        type:         "comment",
        post_id:      postId,
        preview_text: (text || "").slice(0, 80),
        is_read:      false
    });
}

/* Подчищаем уведомления, когда пост удалён */
export async function removeNotificationsForPost(postId) {
    if (!postId) return;
    await supabase.from("notifications").delete().eq("post_id", postId);
}

/*
=====================================================================
UI: ВЫПАДАЮЩАЯ ПАНЕЛЬ УВЕДОМЛЕНИЙ
Подключается на страницах с topbar/sidebar (index, search, author-center).
Открывается и по колокольчику ⚡ в topbar, и по пункту "Уведомления" в sidebar.
=====================================================================
*/

const { data: { user: currentUser } } = await supabase.auth.getUser();

const notifyBtn       = document.getElementById("notifyBtn");
const notifSidebarLink = document.getElementById("notifSidebarLink");

let panelEl  = null;
let isOpen   = false;

if (currentUser && (notifyBtn || notifSidebarLink)) {
    buildPanel();
}

function buildPanel() {
    panelEl = document.createElement("div");
    panelEl.className = "notifications-panel";
    panelEl.id = "notificationsPanel";
    panelEl.innerHTML = `
        <div class="notifications-panel-header">
            <span>Уведомления</span>
            <button type="button" id="notifMarkAllRead">Прочитать всё</button>
        </div>
        <div class="notifications-list" id="notificationsList">
            <p class="notifications-empty">Загрузка...</p>
        </div>
    `;
    document.body.appendChild(panelEl);

    panelEl.addEventListener("click", e => e.stopPropagation());

    document.getElementById("notifMarkAllRead").addEventListener("click", async (e) => {
        e.stopPropagation();
        await markAllRead();
        panelEl.querySelectorAll(".notification-item.unread").forEach(el => el.classList.remove("unread"));
        await refreshBadge();
    });

    [notifyBtn, notifSidebarLink].forEach(trigger => {
        if (!trigger) return;
        trigger.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePanel(trigger);
        });
    });

    document.addEventListener("click", closePanel);
    window.addEventListener("resize", closePanel);

    refreshBadge();
    setInterval(refreshBadge, 20000);
    subscribeRealtime();
}

function togglePanel(anchor) {
    if (isOpen) { closePanel(); return; }
    isOpen = true;
    positionPanel(anchor);
    panelEl.classList.add("open");
    renderList();
}

function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    panelEl.classList.remove("open");
}

function positionPanel(anchor) {
    const rect = anchor.getBoundingClientRect();
    const width = 340;
    let left = rect.right - width;
    if (left < 12) left = 12;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;

    panelEl.style.top  = `${rect.bottom + 8}px`;
    panelEl.style.left = `${left}px`;
}

async function fetchNotifications() {
    const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(30);

    if (error) return [];
    return data || [];
}

async function fetchActorProfiles(ids) {
    const map = new Map();
    if (ids.length === 0) return map;

    const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);

    (data || []).forEach(p => map.set(p.id, p));
    return map;
}

function notificationText(type, actorName, previewText) {
    const name = actorName || "Кто-то";
    if (type === "like")    return `<strong>${name}</strong> понравилась ваша публикация`;
    if (type === "comment") return `<strong>${name}</strong> прокомментировал(а) ваш пост: «${previewText || ""}»`;
    if (type === "follow")  return `<strong>${name}</strong> подписался(-ась) на вас`;
    return "";
}

function notificationIcon(type) {
    if (type === "like")    return "❤️";
    if (type === "comment") return "💬";
    if (type === "follow")  return "➕";
    return "🔔";
}

function notificationLink(notification) {
    if (notification.type === "follow") return `user.html?id=${notification.actor_id}`;
    return "profile.html";
}

async function renderList() {
    const listEl = document.getElementById("notificationsList");
    const items  = await fetchNotifications();

    if (items.length === 0) {
        listEl.innerHTML = `<p class="notifications-empty">Пока нет уведомлений</p>`;
        return;
    }

    const actorIds = [...new Set(items.map(n => n.actor_id))];
    const profiles = await fetchActorProfiles(actorIds);

    listEl.innerHTML = items.map(n => {
        const actor = profiles.get(n.actor_id);
        return `
        <a class="notification-item ${n.is_read ? "" : "unread"}" href="${notificationLink(n)}" data-id="${n.id}">
            <img src="${actor?.avatar_url || 'https://placehold.co/40'}" width="36" height="36">
            <div class="notification-body">
                <span class="notification-text">${notificationIcon(n.type)} ${notificationText(n.type, actor?.username, n.preview_text)}</span>
                <span class="notification-time">${formatTime(n.created_at)}</span>
            </div>
        </a>`;
    }).join("");

    listEl.querySelectorAll(".notification-item").forEach(el => {
        el.addEventListener("click", async () => {
            const id = Number(el.dataset.id);
            el.classList.remove("unread");
            await supabase.from("notifications").update({ is_read: true }).eq("id", id);
            refreshBadge();
        });
    });
}

async function markAllRead() {
    await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_id", currentUser.id)
        .eq("is_read", false);
}

async function refreshBadge() {
    const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", currentUser.id)
        .eq("is_read", false);

    [document.getElementById("notifyBadgeTop"), document.getElementById("notifyBadgeSidebar")]
        .forEach(badge => {
            if (!badge) return;
            if (count > 0) {
                badge.textContent = count > 9 ? "9+" : String(count);
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        });
}

function subscribeRealtime() {
    supabase
        .channel(`notifications-${currentUser.id}`)
        .on("postgres_changes", {
            event: "*", schema: "public", table: "notifications",
            filter: `recipient_id=eq.${currentUser.id}`
        }, () => {
            refreshBadge();
            if (isOpen) renderList();
        })
        .subscribe();
}
