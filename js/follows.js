import { supabase } from "./supabase.js";

/* Количество подписчиков пользователя (на кого подписаны = following_id) */
export async function getFollowersCount(userId) {

    const { count } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", userId);

    return count || 0;
}

/* Количество подписок пользователя (кого читает = follower_id) */
export async function getFollowingCount(userId) {

    const { count } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId);

    return count || 0;
}

/* Подписан ли currentUserId на targetUserId */
export async function isFollowing(currentUserId, targetUserId) {

    if (!currentUserId || !targetUserId) return false;

    const { data } = await supabase
        .from("follows")
        .select("*")
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId)
        .maybeSingle();

    return !!data;
}

/* Подписаться */
export async function followUser(currentUserId, targetUserId) {

    return await supabase
        .from("follows")
        .insert({
            follower_id: currentUserId,
            following_id: targetUserId
        });
}

/* Отписаться */
export async function unfollowUser(currentUserId, targetUserId) {

    return await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);
}

/* Список профилей подписчиков пользователя */
export async function getFollowersList(userId) {

    const { data, error } = await supabase
        .from("follows")
        .select("follower_id, profiles:follower_id(id, username, avatar_url)")
        .eq("following_id", userId);

    if (error) {
        console.error(error);
        return [];
    }

    return (data || [])
        .map(row => row.profiles)
        .filter(Boolean);
}

/* Список профилей, на которых подписан пользователь */
export async function getFollowingList(userId) {

    const { data, error } = await supabase
        .from("follows")
        .select("following_id, profiles:following_id(id, username, avatar_url)")
        .eq("follower_id", userId);

    if (error) {
        console.error(error);
        return [];
    }

    return (data || [])
        .map(row => row.profiles)
        .filter(Boolean);
}
