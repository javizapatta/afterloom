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

interface Message {
  id: number;
  from_user: string;
  to_user: string;
  title: string;
  message: string;
  message_type: "normal" | "capsule" | "emotion" | "event" | "anonymous" | "burn";
  unlock_condition: string | null;
  unlock_at: string | null;
  anonymous_name: string | null;
  expires_at: string | null;
  is_public: boolean;
  created_at: string;
  opened_at: string | null;
}

type FollowStatus = "none" | "following" | "follows_you" | "friends";

function AvatarFallback({ username, size = "w-24 h-24" }: { username: string; size?: string }) {
  const initial = username?.[0]?.toUpperCase() || "?";
  return (
    <div
      className={`${size} rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900 flex items-center justify-center text-white font-mono text-sm border border-white/10`}
    >
      {initial}
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [publicMessages, setPublicMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus>("none");
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [mutualText, setMutualText] = useState<string>("");

  // Obtener usuario actual
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || null);
    });
  }, []);

  // Redirigir si es el propio perfil
  useEffect(() => {
    if (currentUserId && profile && currentUserId === profile.id) {
      router.replace("/?tab=profile");
    }
  }, [currentUserId, profile, router]);

  // Cargar datos del perfil
  useEffect(() => {
    if (!username) return;

    const fetchData = async () => {
      setLoading(true);
      setError(false);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("username", username)
        .single();

      if (profileError || !profileData) {
        setError(true);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // Consultas paralelas
      const [followersRes, followingRes] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profileData.id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profileData.id),
      ]);

      setFollowersCount(followersRes.count || 0);
      setFollowingCount(followingRes.count || 0);

      if (currentUserId && currentUserId !== profileData.id) {
        const [myFollow, theirFollow] = await Promise.all([
          supabase.from("follows").select("id").eq("follower_id", currentUserId).eq("following_id", profileData.id).maybeSingle(),
          supabase.from("follows").select("id").eq("follower_id", profileData.id).eq("following_id", currentUserId).maybeSingle(),
        ]);
        const iFollow = !!myFollow.data;
        const theyFollow = !!theirFollow.data;
        if (iFollow && theyFollow) setFollowStatus("friends");
        else if (iFollow) setFollowStatus("following");
        else if (theyFollow) setFollowStatus("follows_you");
        else setFollowStatus("none");

        // Calcular seguidores mutuos
        const { data: common } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", profileData.id)
          .in(
            "follower_id",
            (await supabase.from("follows").select("following_id").eq("follower_id", currentUserId)).data?.map((f) => f.following_id) || []
          );
        const mutualCount = common?.length || 0;
        if (mutualCount > 0) {
          const { data: firstMutual } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", common![0].follower_id)
            .single();
          if (firstMutual) {
            setMutualText(`Followed by @${firstMutual.username}${mutualCount > 1 ? ` and ${mutualCount - 1} other${mutualCount - 1 > 1 ? 's' : ''}` : ''}`);
          }
        } else {
          setMutualText("");
        }
      } else {
        setMutualText("");
      }

      // Mensajes públicos
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("to_user", profileData.username)
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (messagesData) {
        const now = new Date();
        const unlockedMessages = messagesData.filter((msg: Message) => {
          if (msg.message_type === "burn") return false;
          if (msg.unlock_at && new Date(msg.unlock_at) > now) return false;
          if ((msg.message_type === "emotion" || msg.message_type === "event") && !msg.opened_at) return false;
          return true;
        });
        setPublicMessages(unlockedMessages);
      } else {
        setPublicMessages([]);
      }

      setLoading(false);
    };

    fetchData();
  }, [username, currentUserId]);

  const handleFollow = async () => {
    if (!currentUserId || !profile) return;
    setFollowLoading(true);
    if (followStatus === "following" || followStatus === "friends") {
      await supabase.from("follows").delete().eq("follower_id", currentUserId).eq("following_id", profile.id);
      const newStatus = followStatus === "friends" ? "follows_you" : "none";
      setFollowStatus(newStatus);
      setFollowersCount(prev => prev - 1);
    } else if (followStatus === "none" || followStatus === "follows_you") {
      await supabase.from("follows").insert({ follower_id: currentUserId, following_id: profile.id });
      const newStatus = followStatus === "follows_you" ? "friends" : "following";
      setFollowStatus(newStatus);
      setFollowersCount(prev => prev + 1);
    }
    setFollowLoading(false);
  };

  const handleSendMessage = () => {
    router.push(`/?to=${profile?.username}&tab=messages&subtab=sent`);
  };

  const getButtonText = () => {
    if (followLoading) return "...";
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
    return "border-neutral-800 hover:border-neutral-500";
  };

  if (loading) {
    return (
      <main className="bg-black text-neutral-200 min-h-screen flex items-center justify-center font-mono text-xs tracking-widest animate-pulse">
        Loading profile...
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="bg-black text-white min-h-screen flex items-center justify-center flex-col gap-4">
        <h1 className="text-2xl font-light">User not found.</h1>
        <button
          onClick={() => router.push("/")}
          className="border border-neutral-800 px-4 py-2 rounded-full text-xs hover:border-neutral-500 transition-all duration-200"
        >
          ← Back home
        </button>
      </main>
    );
  }

  return (
    <main className="relative bg-black text-neutral-200 min-h-screen flex flex-col items-center overflow-x-hidden selection:bg-white selection:text-black">
      <div className="absolute w-[600px] h-[600px] bg-neutral-800/10 rounded-full blur-[160px] -top-40 pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-xl flex flex-col items-center pb-40 px-4 mt-16">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.username}
            className="w-24 h-24 rounded-full grayscale border border-white/10 object-cover"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        ) : (
          <AvatarFallback username={profile.username} size="w-24 h-24" />
        )}
        <h1 className="text-2xl font-light mt-4 text-white tracking-widest">@{profile.username}</h1>

        <p className="text-sm text-neutral-400 mt-4 text-center max-w-sm">{profile.bio || "No bio yet."}</p>

        <div className="flex gap-6 mt-4 text-center">
          <button
            onClick={() => router.push(`/${profile.username}/followers`)}
            className="group transition-all duration-200"
          >
            <p className="text-xs text-neutral-500 uppercase tracking-wider group-hover:text-white">Followers</p>
            <p className="text-lg font-light text-white">{followersCount}</p>
          </button>
          <button
            onClick={() => router.push(`/${profile.username}/following`)}
            className="group transition-all duration-200"
          >
            <p className="text-xs text-neutral-500 uppercase tracking-wider group-hover:text-white">Following</p>
            <p className="text-lg font-light text-white">{followingCount}</p>
          </button>
        </div>

        {mutualText && <p className="text-xs text-neutral-500 mt-2">{mutualText}</p>}

        <div className="flex gap-4 mt-6">
          <button
            onClick={handleFollow}
            disabled={followLoading}
            className={`border px-5 py-2 rounded-full text-xs font-mono transition-all duration-200 ${getButtonClass()}`}
          >
            {getButtonText()}
          </button>
          <button
            onClick={handleSendMessage}
            className="bg-white text-black px-5 py-2 rounded-full text-xs font-semibold tracking-wider hover:bg-neutral-200 transition-all duration-200"
          >
            Message
          </button>
        </div>

        <div className="mt-12 flex flex-col gap-6 w-full">
          <div className="border-b border-neutral-800 pb-2 flex justify-between items-center">
            <h3 className="text-xs uppercase font-mono tracking-widest text-neutral-400">Public Messages</h3>
            <span className="text-[10px] font-mono text-neutral-600">{publicMessages.length} messages</span>
          </div>
          {publicMessages.map((msg) => (
            <div key={msg.id} className="w-full bg-neutral-950 border border-white/5 p-6 rounded-2xl hover:border-neutral-500 transition-all duration-200">
              <p className="text-[10px] font-mono text-neutral-500 mb-2 uppercase tracking-widest">
                From {msg.message_type === "anonymous" ? msg.anonymous_name || "Anonymous" : `@${msg.from_user}`}
              </p>
              <h4 className="text-md font-semibold text-white mb-2">{msg.title}</h4>
              <p className="text-sm text-neutral-300 font-light leading-relaxed whitespace-pre-wrap">{msg.message}</p>
              <p className="text-[10px] font-mono text-neutral-600 text-right mt-3">{new Date(msg.created_at).toLocaleDateString()}</p>
            </div>
          ))}
          {publicMessages.length === 0 && (
            <p className="text-neutral-600 font-mono text-xs tracking-wider text-center mt-6">No public messages yet.</p>
          )}
        </div>

        <button
          onClick={() => router.push("/")}
          className="mt-8 border border-neutral-800 text-neutral-500 hover:text-white px-4 py-2 rounded-full text-xs font-mono transition-all duration-200"
        >
          ← Back to home
        </button>
      </div>
    </main>
  );
}