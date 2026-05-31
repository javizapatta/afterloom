"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

interface Profile {
  id: string;
  username: string;
  bio: string;
  avatar_url: string;
}

type FollowStatus = "none" | "following" | "follows_you" | "friends";

function AvatarFallback({ username, size = "w-10 h-10" }: { username: string; size?: string }) {
  const initial = username?.[0]?.toUpperCase() || "?";
  return (
    <div
      className={`${size} rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-white font-mono text-sm border border-white/10`}
    >
      {initial}
    </div>
  );
}

function FollowingItem({ user, currentUserId }: { user: Profile; currentUserId: string | null }) {
  const router = useRouter();
  const [followStatus, setFollowStatus] = useState<FollowStatus>("none");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    const fetchStatus = async () => {
      const [myFollow, theirFollow] = await Promise.all([
        supabase.from("follows").select("id").eq("follower_id", currentUserId).eq("following_id", user.id).maybeSingle(),
        supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", currentUserId).maybeSingle(),
      ]);
      const iFollow = !!myFollow.data;
      const theyFollow = !!theirFollow.data;
      if (iFollow && theyFollow) setFollowStatus("friends");
      else if (iFollow) setFollowStatus("following");
      else if (theyFollow) setFollowStatus("follows_you");
      else setFollowStatus("none");
    };
    fetchStatus();
  }, [currentUserId, user.id]);

  const handleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUserId) return;
    setLoading(true);
    if (followStatus === "following" || followStatus === "friends") {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", user.id);
      setFollowStatus(followStatus === "friends" ? "follows_you" : "none");
    } else if (followStatus === "none" || followStatus === "follows_you") {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: user.id });
      setFollowStatus(followStatus === "follows_you" ? "friends" : "following");
    }
    setLoading(false);
  };

  const getButtonText = () => {
    if (loading) return "...";
    switch (followStatus) {
      case "following": return "Following";
      case "follows_you": return "Follows you";
      case "friends": return "Friends";
      default: return "Follow";
    }
  };

  const getButtonClass = () => {
    if (followStatus === "friends" || followStatus === "following") {
      return "bg-white/10 text-white border border-white/20 hover:bg-white/20";
    }
    return "bg-white text-black hover:bg-neutral-200";
  };

  return (
    <div
      onClick={() => router.push(`/${user.username}`)}
      className="w-full border border-white/5 rounded-2xl p-5 bg-neutral-950/60 cursor-pointer hover:border-neutral-500 transition-all duration-200 flex items-center gap-4"
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt={user.username} className="w-14 h-14 rounded-full object-cover border border-white/10" />
      ) : (
        <AvatarFallback username={user.username} size="w-14 h-14" />
      )}
      <div className="flex-1">
        <p className="font-medium text-white">@{user.username}</p>
        <p className="text-neutral-500 text-xs mt-1 line-clamp-2">{user.bio || "No bio yet."}</p>
      </div>
      {user.id !== currentUserId && (
        <button
          onClick={handleFollow}
          disabled={loading}
          className={`text-xs px-3 py-1.5 rounded-full transition-all duration-200 ${getButtonClass()}`}
        >
          {getButtonText()}
        </button>
      )}
    </div>
  );
}

export default function FollowingPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [following, setFollowing] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || null);
    });
  }, []);

  useEffect(() => {
    if (!username) return;
    const fetchData = async () => {
      setLoading(true);
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();
      if (!profileData) {
        setLoading(false);
        return;
      }
      setProfile(profileData);
      const { data: followsData } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", profileData.id);
      if (followsData && followsData.length > 0) {
        const followingIds = followsData.map(f => f.following_id);
        const { data: usersData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", followingIds);
        setFollowing(usersData || []);
      } else {
        setFollowing([]);
      }
      setLoading(false);
    };
    fetchData();
  }, [username]);

  if (loading) {
    return (
      <main className="bg-black text-white min-h-screen flex items-center justify-center">
        Loading...
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="bg-black text-white min-h-screen flex items-center justify-center">
        User not found.
      </main>
    );
  }

  return (
    <main className="bg-black text-white min-h-screen flex flex-col items-center p-4">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.back()} className="text-neutral-400 hover:text-white transition-all duration-200">
            ← Back
          </button>
          <h1 className="text-xl font-light">Following by @{profile.username}</h1>
        </div>
        <div className="flex flex-col gap-4">
          {following.map(user => (
            <FollowingItem key={user.id} user={user} currentUserId={currentUserId} />
          ))}
          {following.length === 0 && (
            <p className="text-neutral-500 text-center">Not following anyone yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}