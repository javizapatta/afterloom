"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useEffect, useState } from "react";
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
  message_type: "normal" | "countdown" | "capsule" | "emotion" | "event" | "anonymous" | "burn";
  unlock_condition: string | null;
  unlock_at: string | null;
  anonymous_name: string | null;
  expires_at: string | null;
  is_public: boolean;
  created_at: string;
  opened_at: string | null;
}

type LockStatus = {
  locked: boolean;
  reason: string;
  canUnlock: boolean;
  isBurn: boolean;
};

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [tab, setTab] = useState("messages");
  const [messageTab, setMessageTab] = useState("inbox");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeBurns, setActiveBurns] = useState<Set<number>>(new Set());

  // Hora oficial del servidor (actualizada periódicamente para la UI)
  const [serverTime, setServerTime] = useState<Date | null>(null);

  const [showComposer, setShowComposer] = useState(false);
  const [selectedUser, setSelectedUser] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<Message["message_type"]>("normal");

  const [timerOption, setTimerOption] = useState("1hour");
  const [specificDate, setSpecificDate] = useState("");
  const [customCondition, setCustomCondition] = useState("");
  const [pseudonym, setPseudonym] = useState("");

  // ==========================================
  // SESIÓN Y PERFIL
  // ==========================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setProfile(null);
        setMessages([]);
        setActiveBurns(new Set());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoadingProfile(false);
      return;
    }

    const fetchProfile = async () => {
      setLoadingProfile(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) setProfile(data);
      setLoadingProfile(false);
    };

    fetchProfile();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!profile) return;

    const fetchCoreData = async () => {
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .or(`from_user.eq.${profile.username},to_user.eq.${profile.username}`)
        .order("id", { ascending: false });

      if (msgData) setMessages(msgData);

      const { data: userData } = await supabase.from("profiles").select("*");
      if (userData) setUsers(userData);
    };

    fetchCoreData();
  }, [profile]);

  // ==========================================
  // OBTENER HORA OFICIAL DEL SERVIDOR (con tipado y comprobación)
  // ==========================================
  const fetchServerTime = async (): Promise<Date> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("now() as now")
        .limit(1)
        .returns<{ now: string }[]>();
      if (error) throw error;
      if (data && data[0]?.now) {
        const serverDate = new Date(data[0].now);
        setServerTime(serverDate);
        return serverDate;
      }
      throw new Error("No data");
    } catch (err) {
      console.warn("Fallback to local time", err);
    }
    const localNow = new Date();
    setServerTime(localNow);
    return localNow;
  };

  // Actualizar la hora del servidor cada 60 segundos (solo para UI)
  useEffect(() => {
    fetchServerTime();
    const interval = setInterval(fetchServerTime, 60000);
    window.addEventListener("focus", fetchServerTime);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", fetchServerTime);
    };
  }, []);

  // ==========================================
  // LÓGICA DE DESBLOQUEO (usando serverTime para UI)
  // ==========================================
  const getLockStatus = (msg: Message): LockStatus => {
    const now = serverTime || new Date(); // fallback local mientras carga

    if (msg.message_type === "burn" && msg.opened_at && !activeBurns.has(msg.id)) {
      return { locked: true, reason: "This message expired.", canUnlock: false, isBurn: true };
    }
    if (msg.message_type === "burn" && !msg.opened_at && !activeBurns.has(msg.id)) {
      return { locked: true, reason: "Burn after reading.", canUnlock: true, isBurn: true };
    }
    if ((msg.message_type === "emotion" || msg.message_type === "event") && !msg.opened_at) {
      return { locked: true, reason: `Condition: "${msg.unlock_condition || "When the moment is right"}"`, canUnlock: true, isBurn: false };
    }
    if (msg.unlock_at && new Date(msg.unlock_at) > now) {
      return { locked: true, reason: `Locked until ${new Date(msg.unlock_at).toLocaleString()}`, canUnlock: false, isBurn: false };
    }
    return { locked: false, reason: "", canUnlock: false, isBurn: false };
  };

  const unlockEmotionEvent = async (msgId: number) => {
    const nowStr = new Date().toISOString();
    const { error } = await supabase
      .from("messages")
      .update({ opened_at: nowStr })
      .eq("id", msgId);
    if (!error) {
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, opened_at: nowStr } : m)
      );
    }
  };

  const revealAndBurn = async (msgId: number) => {
    const nowStr = new Date().toISOString();
    setActiveBurns(prev => new Set(prev).add(msgId));
    await supabase
      .from("messages")
      .update({ opened_at: nowStr })
      .eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, opened_at: nowStr } : m));
    setTimeout(() => {
      setActiveBurns(prev => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, opened_at: nowStr } : m));
    }, 15000);
  };

  // ==========================================
  // FILTROS
  // ==========================================
  const filteredInboxMessages = messages
    .filter(m => m.to_user === profile?.username)
    .filter(m => !(m.message_type === "burn" && m.opened_at && !activeBurns.has(m.id)));

  const sentMessages = messages
    .filter(m => m.from_user === profile?.username)
    .filter(m => !(m.message_type === "burn" && m.opened_at && !activeBurns.has(m.id)));

  const publicMessages = messages.filter(
    m => m.to_user === profile?.username && m.is_public && !getLockStatus(m).locked && m.message_type !== "burn"
  );

  const selectedProfile = users.find(u => u.username === selectedUser);
  const selectedUserPublicMessages = messages.filter(
    m => m.to_user === selectedUser && m.is_public && !getLockStatus(m).locked && m.message_type !== "burn"
  );

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) && u.username !== profile?.username
  );

  // ==========================================
  // ACCIONES DE ENVÍO (con hora fresca del servidor)
  // ==========================================
  const handleCreateProfile = async () => {
    if (!username.trim()) return alert("Username required.");
    const newProfile = {
      id: session.user.id,
      username: username.trim().toLowerCase(),
      bio,
      avatar_url: session.user.user_metadata?.avatar_url || "",
    };
    const { error } = await supabase.from("profiles").insert([newProfile]);
    if (!error) setProfile(newProfile);
  };

  const handleSendMessage = async () => {
    if (!selectedUser || !profile) return;
    if (!newTitle.trim() || !newMessage.trim()) return alert("Fill all fields.");

    // Obtener la hora exacta del servidor en este momento (con tipado y comprobación)
    let baseTime: Date;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("now() as now")
        .limit(1)
        .returns<{ now: string }[]>();
      if (error) throw error;
      if (data && data[0]?.now) {
        baseTime = new Date(data[0].now);
      } else {
        throw new Error("No data");
      }
    } catch (err) {
      console.warn("Could not fetch server time, using local time", err);
      baseTime = new Date(); // fallback local
    }

    let unlock_at: string | null = null;
    let expires_at: string | null = null;
    let unlock_condition: string | null = null;
    let anonymous_name: string | null = null;

    if (messageType === "countdown") {
      let hours = 0;
      if (timerOption === "1hour") hours = 1;
      else if (timerOption === "1day") hours = 24;
      else if (timerOption === "1week") hours = 168;
      unlock_at = new Date(baseTime.getTime() + hours * 60 * 60 * 1000).toISOString();
    } else if (messageType === "capsule") {
      if (specificDate) {
        // Guardamos la fecha específica (se interpreta en la zona local del navegador,
        // pero se almacena como UTC). Es responsabilidad del usuario elegir bien.
        unlock_at = new Date(specificDate).toISOString();
      }
    } else if (messageType === "emotion" || messageType === "event") {
      unlock_condition = customCondition.trim() || "When the moment is right";
    } else if (messageType === "anonymous") {
      anonymous_name = pseudonym.trim() || "An anonymous echo";
    }

    const newMessagePayload = {
      from_user: profile.username,
      to_user: selectedUser,
      title: newTitle,
      message: newMessage,
      message_type: messageType,
      unlock_condition,
      unlock_at,
      anonymous_name,
      expires_at,
      is_public: false,
      opened_at: null,
    };

    const { data, error } = await supabase.from("messages").insert([newMessagePayload]).select();

    if (!error && data) {
      setMessages([data[0], ...messages]);
      setNewTitle("");
      setNewMessage("");
      setCustomCondition("");
      setPseudonym("");
      setShowComposer(false);
    } else {
      alert("Error sending message: " + error?.message);
    }
  };

  const toggleMessagePublicity = async (messageId: number, currentStatus: boolean) => {
    const { error } = await supabase
      .from("messages")
      .update({ is_public: !currentStatus })
      .eq("id", messageId);
    if (!error) {
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, is_public: !currentStatus } : m))
      );
    }
  };

  // ==========================================
  // RENDERS CONDICIONALES
  // ==========================================
  if (!session) {
    return (
      <main className="bg-black text-neutral-100 min-h-screen flex items-center justify-center font-sans">
        <div className="w-[380px] border border-white/5 p-8 rounded-3xl bg-neutral-950/50 backdrop-blur-md">
          <h1 className="text-4xl font-light mb-2 text-center tracking-[0.3em] text-white">AFTERLOOM</h1>
          <p className="text-xs text-neutral-500 text-center mb-8 tracking-wider">Messages tied to moments.</p>
          <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={["google"]} theme="dark" />
        </div>
      </main>
    );
  }

  if (loadingProfile) {
    return (
      <main className="bg-black text-neutral-400 min-h-screen flex items-center justify-center font-mono text-xs tracking-widest animate-pulse">
        Loading...
      </main>
    );
  }

  if (session && !profile) {
    return (
      <main className="bg-black text-white min-h-screen flex items-center justify-center p-4">
        <div className="w-[380px] flex flex-col gap-5 bg-neutral-950 border border-white/10 p-8 rounded-3xl">
          <h1 className="text-2xl font-light tracking-widest text-center">Create Profile</h1>
          <p className="text-xs text-neutral-500 text-center -mt-2">Choose your username.</p>
          <input
            type="text"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-sm font-mono"
          />
          <textarea
            placeholder="Write your bio..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none h-28 resize-none text-sm"
          />
          <button
            onClick={handleCreateProfile}
            className="border border-white/20 bg-white text-black text-xs font-semibold tracking-widest uppercase py-3 rounded-xl hover:bg-neutral-200 transition"
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  // ==========================================
  // RENDER PRINCIPAL (completo y sin errores)
  // ==========================================
  return (
    <main className="relative bg-black text-neutral-200 min-h-screen flex flex-col items-center overflow-x-hidden selection:bg-white selection:text-black">
      <div className="absolute w-[600px] h-[600px] bg-neutral-800/10 rounded-full blur-[160px] -top-40 pointer-events-none"></div>

      <header className="relative z-10 text-center mt-16">
        <h1 className="text-6xl font-extralight tracking-[0.4em] text-white cursor-pointer" onClick={() => setTab("messages")}>
          AFTERLOOM
        </h1>
        <p className="text-xs font-mono text-neutral-500 tracking-[0.2em] mt-3 uppercase">
          Messages tied to moments.
        </p>
      </header>

      {/* ========== TABLA DE MENSAJES ========== */}
      {tab === "messages" && (
        <div className="relative z-10 mt-12 flex flex-col items-center pb-40 w-full max-w-xl px-4">
          <div className="flex gap-8 mb-10 border-b border-white/5 w-full justify-center pb-4">
            <button
              onClick={() => setMessageTab("inbox")}
              className={`text-xs uppercase tracking-widest transition ${messageTab === "inbox" ? "text-white font-bold border-b border-white pb-4 -mb-[17px]" : "text-neutral-600"}`}
            >
              Inbox ({filteredInboxMessages.length})
            </button>
            <button
              onClick={() => setMessageTab("sent")}
              className={`text-xs uppercase tracking-widest transition ${messageTab === "sent" ? "text-white font-bold border-b border-white pb-4 -mb-[17px]" : "text-neutral-600"}`}
            >
              Sent ({sentMessages.length})
            </button>
          </div>

          {messageTab === "sent" && (
            <button
              onClick={() => setShowComposer(!showComposer)}
              className="mb-8 border border-neutral-800 bg-neutral-950 px-6 py-2.5 rounded-full hover:border-neutral-400 text-xs font-mono tracking-widest text-neutral-300 transition"
            >
              {showComposer ? "Close" : "+ New Message"}
            </button>
          )}

          {/* COMPOSER */}
          {showComposer && (
            <div className="w-full flex flex-col gap-4 mb-10 bg-neutral-950 p-6 rounded-2xl border border-white/5 backdrop-blur-xl animate-fadeIn">
              <label className="text-xs font-mono text-neutral-500 tracking-wider">Recipient</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm text-white font-mono"
              >
                <option value="">Choose user...</option>
                {users.filter(u => u.username !== profile?.username).map((u, i) => (
                  <option key={i} value={u.username}>@{u.username}</option>
                ))}
              </select>

              

              <label className="text-xs font-mono text-neutral-500 tracking-wider mt-2">Message Type</label>
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as Message["message_type"])}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm text-white font-mono"
              >
                <option value="normal">
  Normal Message (Permanent)
</option>

<option value="countdown">
  Countdown Message (Opens Later)
</option>

<option value="capsule">
  Time Capsule (Opens on Date)
</option>

<option value="emotion">
  Emotional Trigger (Open When Ready)
</option>

<option value="event">
  Event Message (Life Moment)
</option>

<option value="anonymous">
  Anonymous Message (Hidden Identity)
</option>

<option value="burn">
  Burn After Reading (Disappears Forever)
</option>
              </select>

              {messageType === "countdown" && (
                <select
                  value={timerOption}
                  onChange={(e) => setTimerOption(e.target.value)}
                  className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm font-mono text-white"
                >
                  <option value="1hour">Opens in 1 Hour</option>
                  <option value="1day">Opens in 1 Day</option>
                  <option value="1week">Opens in 1 Week</option>
                </select>
              )}

              {messageType === "capsule" && (
                <input
                  type="datetime-local"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm font-mono text-white"
                />
              )}

              {(messageType === "emotion" || messageType === "event") && (
                <input
                  type="text"
                  placeholder={messageType === "emotion" ? "e.g., Open when you need this" : "e.g., Open on your birthday"}
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm italic"
                />
              )}

              {messageType === "anonymous" && (
                <input
                  type="text"
                  placeholder="Pseudonym (e.g., VelvetGhost)"
                  value={pseudonym}
                  onChange={(e) => setPseudonym(e.target.value)}
                  className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm font-mono text-neutral-300"
                />
              )}
              <input
                type="text"
                placeholder="Message title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm"
              />

              <textarea
                placeholder="Write your message. This message cannot be edited or erased."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none h-40 resize-none text-sm leading-relaxed"
              />

              <button
                onClick={handleSendMessage}
                className="bg-white text-black font-semibold tracking-widest uppercase text-xs py-3.5 rounded-xl hover:bg-neutral-200 transition mt-4"
              >
                Send Message
              </button>
            </div>
          )}

          {/* LISTADO DE TARJETAS */}
          <div className="flex flex-col gap-6 w-full">
            {(messageTab === "inbox" ? filteredInboxMessages : sentMessages).map((msg) => {
              const lock = getLockStatus(msg);
              const senderDisplay = msg.message_type === "anonymous" && messageTab === "inbox"
                ? msg.anonymous_name || "Anonymous"
                : `@${msg.from_user}`;
              const isCurrentlyBurning = activeBurns.has(msg.id);

              return (
                <div key={msg.id} className="w-full bg-neutral-950/40 p-6 rounded-2xl border border-white/5 flex flex-col gap-2 relative group">
                  <div className="flex justify-between items-center text-xs font-mono text-neutral-500">
                    <span>{messageTab === "inbox" ? `FROM: ${senderDisplay}` : `TO: @${msg.to_user}`}</span>
                    <span className="bg-neutral-900 px-2 py-0.5 rounded text-[10px] tracking-wider uppercase text-neutral-400 flex items-center gap-1">
                      {msg.message_type}
                      {msg.message_type === "burn" && !msg.opened_at && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />}
                    </span>
                  </div>

                  {lock.locked ? (
                    <div className="bg-neutral-900/50 border border-dashed border-neutral-800 rounded-xl p-6 text-center my-2">
                      <p className="text-xs font-mono text-neutral-400 tracking-wide">{lock.reason}</p>
                      {lock.canUnlock && (
                        <button
                          onClick={() => lock.isBurn ? revealAndBurn(msg.id) : unlockEmotionEvent(msg.id)}
                          className="mt-3 border border-white/20 bg-black/50 px-4 py-1.5 rounded-full text-xs font-mono tracking-wider hover:bg-white hover:text-black transition"
                        >
                          {lock.isBurn ? "Open Message" : "Open now"}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="my-2">
                      <h3 className="text-md font-semibold text-white mb-2">{msg.title}</h3>
                      <p className="text-sm text-neutral-300 font-light leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      {isCurrentlyBurning && (
                        <p className="text-[10px] font-mono text-red-400/80 mt-3 italic animate-pulse">
                          🔥 This message will disappear in a few seconds.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center text-[11px] font-mono text-neutral-600 pt-2 border-t border-white/5">
                    <span>{new Date(msg.created_at).toLocaleDateString()}</span>
                    {messageTab === "inbox" && !lock.locked && msg.message_type !== "burn" && (
                      <button
                        onClick={() => toggleMessagePublicity(msg.id, msg.is_public)}
                        className={`px-3 py-1 rounded-md transition ${msg.is_public ? "bg-white text-black font-semibold" : "border border-neutral-800 text-neutral-400 hover:border-neutral-500"}`}
                      >
                        {msg.is_public ? "Added to Profile" : "Add to Profile"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {(messageTab === "inbox" ? filteredInboxMessages : sentMessages).length === 0 && (
              <p className="text-neutral-600 text-center font-mono text-xs tracking-widest mt-12">No messages yet.</p>
            )}
          </div>
        </div>
      )}

      {/* ========== BÚSQUEDA ========== */}
      {tab === "search" && (
        <div className="relative z-10 mt-12 flex flex-col items-center pb-40 w-full max-w-md px-4">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-white/5 rounded-xl px-5 py-3.5 outline-none font-mono text-sm"
          />
          <div className="mt-8 flex flex-col gap-4 w-full">
            {filteredUsers.map((u, index) => (
              <div
                key={index}
                onClick={() => {
                  setSelectedUser(u.username);
                  setTab("userProfile");
                }}
                className="w-full border border-white/5 rounded-2xl p-5 bg-neutral-950/60 cursor-pointer hover:border-neutral-700 transition flex justify-between items-center"
              >
                <div>
                  <p className="font-medium text-white">@{u.username}</p>
                  <p className="text-neutral-500 text-xs mt-1 line-clamp-1 italic">{u.bio || "No bio yet."}</p>
                </div>
                <span className="text-neutral-600 font-mono text-xs">View Profile →</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========== PERFIL PROPIO ========== */}
      {tab === "profile" && (
        <div className="relative z-10 mt-12 w-full max-w-xl flex flex-col items-center pb-40 px-4">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="avatar" className="w-20 h-20 rounded-full grayscale border border-white/10" />
          )}
          <h2 className="text-2xl font-light mt-4 text-white tracking-widest">@{profile?.username}</h2>
          <p className="text-sm text-neutral-400 mt-2 text-center italic max-w-sm font-light">"{profile?.bio || "No bio yet."}"</p>

          <div className="mt-12 flex flex-col gap-6 w-full">
            <div className="border-b border-neutral-800 pb-2 flex justify-between items-center">
              <h3 className="text-xs uppercase font-mono tracking-widest text-neutral-400">Public Messages</h3>
              <span className="text-[10px] font-mono text-neutral-600">{publicMessages.length} messages</span>
            </div>
            {publicMessages.map((msg) => (
              <div key={msg.id} className="w-full bg-neutral-950 border border-white/5 p-6 rounded-2xl">
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
            onClick={async () => await supabase.auth.signOut()}
            className="absolute top-0 right-4 border border-neutral-800 text-neutral-500 hover:text-white px-3 py-1 rounded text-xs font-mono"
          >
            Logout
          </button>
        </div>
      )}

      {/* ========== PERFIL AJENO ========== */}
      {tab === "userProfile" && (
        <div className="relative z-10 mt-12 flex flex-col items-center pb-40 w-full max-w-xl px-4">
          {selectedProfile?.avatar_url && (
            <img src={selectedProfile.avatar_url} alt="avatar" className="w-20 h-20 rounded-full grayscale border border-white/10" />
          )}
          <h2 className="text-2xl font-light mt-4 text-white tracking-widest">@{selectedUser}</h2>
          <p className="text-sm text-neutral-400 mt-2 text-center italic max-w-sm font-light">"{selectedProfile?.bio || "No manifesto."}"</p>

          <div className="mt-12 flex flex-col gap-6 w-full">
            <div className="border-b border-neutral-800 pb-2 flex justify-between items-center">
              <h3 className="text-xs uppercase font-mono tracking-widest text-neutral-400">Public Messages of @{selectedUser}</h3>
              <span className="text-[10px] font-mono text-neutral-600">{selectedUserPublicMessages.length} messages</span>
            </div>
            {selectedUserPublicMessages.map((msg) => (
              <div key={msg.id} className="w-full bg-neutral-950 border border-white/5 p-6 rounded-2xl">
                <p className="text-[10px] font-mono text-neutral-500 mb-2 uppercase tracking-widest">
                  From {msg.message_type === "anonymous" ? msg.anonymous_name || "Anonymous" : `@${msg.from_user}`}
                </p>
                <h4 className="text-md font-semibold text-white mb-2">{msg.title}</h4>
                <p className="text-sm text-neutral-300 font-light leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                <p className="text-[10px] font-mono text-neutral-600 text-right mt-3">{new Date(msg.created_at).toLocaleDateString()}</p>
              </div>
            ))}
            {selectedUserPublicMessages.length === 0 && (
              <p className="text-neutral-600 font-mono text-xs tracking-wider text-center mt-6">No public messages yet.</p>
            )}
          </div>
        </div>
      )}

      {/* BARRA DE NAVEGACIÓN */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-8 z-20">
        <div className="bg-neutral-950/80 backdrop-blur-md border border-white/5 rounded-full px-8 py-3.5 flex gap-10 shadow-2xl">
          {["messages", "search", "profile"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs uppercase tracking-[0.15em] transition ${tab === t || (t === "messages" && tab === "userProfile") ? "text-white font-bold" : "text-neutral-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}