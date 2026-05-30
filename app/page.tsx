"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useEffect, useState, useRef } from "react";
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
  // Eliminado 'countdown'
  message_type: "normal" | "capsule" | "emotion" | "event" | "anonymous" | "burn";
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

// Componente para fallback de avatar (sin librerías)
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

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [newBio, setNewBio] = useState("");
  const [tab, setTab] = useState("messages");
  const [messageTab, setMessageTab] = useState("inbox");
  const [search, setSearch] = useState("");

  const [users, setUsers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeBurns, setActiveBurns] = useState<Set<number>>(new Set());

  const [serverTime, setServerTime] = useState<Date | null>(null);

  const [showComposer, setShowComposer] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipientUsername, setRecipientUsername] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [messageType, setMessageType] = useState<Message["message_type"]>("normal");
  const [isSending, setIsSending] = useState(false);

  // Eliminado timerOption (countdown)
  const [capsuleDate, setCapsuleDate] = useState("");
  const [capsuleTime, setCapsuleTime] = useState("");
  const [customCondition, setCustomCondition] = useState("");
  const [pseudonym, setPseudonym] = useState("");

  const suggestionRef = useRef<HTMLDivElement>(null);

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

  // Cerrar sugerencias al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ==========================================
  // OBTENER HORA OFICIAL DEL SERVIDOR
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
  // LÓGICA DE DESBLOQUEO
  // ==========================================
  const getLockStatus = (msg: Message): LockStatus => {
    const now = serverTime || new Date();

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

  const selectedProfile = users.find(u => u.username === recipientUsername);
  const selectedUserPublicMessages = messages.filter(
    m => m.to_user === recipientUsername && m.is_public && !getLockStatus(m).locked && m.message_type !== "burn"
  );

  // Sugerencias para el compositor
  const recipientSuggestions = users
    .filter(u =>
      u.username !== profile?.username &&
      u.username.toLowerCase().includes(recipientInput.toLowerCase())
    )
    .slice(0, 5);

  // Sugerencias para la pestaña search
  const searchResults = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) && u.username !== profile?.username
  );

  // ==========================================
  // ACCIONES
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

  const handleSaveBio = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ bio: newBio })
      .eq("id", profile.id);
    if (error) {
      alert(error.message);
      return;
    }
    setProfile({ ...profile, bio: newBio });
    setEditingBio(false);
  };

  const handleSendMessage = async () => {
    if (isSending) return;
    if (!recipientUsername || !profile) return;
    if (!newTitle.trim() || !newMessage.trim()) return alert("Fill all fields.");

    const userExists = users.some(
      (u) => u.username.toLowerCase() === recipientUsername.trim().toLowerCase()
    );
    if (!userExists) {
      alert("User not found.");
      return;
    }

    setIsSending(true);

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
      baseTime = new Date();
    }

    let unlock_at: string | null = null;
    let unlock_condition: string | null = null;
    let anonymous_name: string | null = null;

    // Eliminado countdown
    if (messageType === "capsule") {
      if (capsuleDate && capsuleTime) {
        const combined = new Date(`${capsuleDate}T${capsuleTime}`);
        if (isNaN(combined.getTime())) {
          alert("Invalid date or time");
          setIsSending(false);
          return;
        }
        if (combined <= baseTime) {
          alert("The capsule date must be in the future.");
          setIsSending(false);
          return;
        }
        unlock_at = combined.toISOString();
      } else {
        alert("Please select both date and time for the time capsule");
        setIsSending(false);
        return;
      }
    } else if (messageType === "emotion" || messageType === "event") {
      unlock_condition = customCondition.trim() || "When the moment is right";
    } else if (messageType === "anonymous") {
      anonymous_name = pseudonym.trim() || "An anonymous echo";
    }

    const newMessagePayload = {
      from_user: profile.username,
      to_user: recipientUsername,
      title: newTitle,
      message: newMessage,
      message_type: messageType,
      unlock_condition,
      unlock_at,
      anonymous_name,
      expires_at: null,
      is_public: false,
      opened_at: null,
    };

    const { data, error } = await supabase.from("messages").insert([newMessagePayload]).select();

    if (!error && data) {
      setMessages([data[0], ...messages]);
      // Resetear formulario
      setNewTitle("");
      setNewMessage("");
      setCustomCondition("");
      setPseudonym("");
      setCapsuleDate("");
      setCapsuleTime("");
      setRecipientInput("");
      setRecipientUsername("");
      setShowComposer(false);
    } else {
      alert("Error sending message: " + error?.message);
    }
    setIsSending(false);
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
      <main className="bg-black text-neutral-100 min-h-screen flex items-center justify-center font-sans p-4">
        <div className="w-full max-w-[380px] border border-white/5 p-8 rounded-3xl bg-neutral-950/50 backdrop-blur-md">
          <h1 className="text-4xl font-light mb-2 text-center tracking-[0.3em] text-white">AFTERLOOM</h1>
          <p className="text-xs text-neutral-500 text-center mb-8 tracking-wider">Messages tied to moments.</p>
          <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} providers={["google"]} theme="dark" />
        </div>
      </main>
    );
  }

  if (loadingProfile) {
    return (
      <main className="bg-black text-neutral-400 min-h-screen flex items-center justify-center font-mono text-xs tracking-widest animate-pulse p-4">
        Loading...
      </main>
    );
  }

  if (session && !profile) {
    return (
      <main className="bg-black text-white min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-[380px] flex flex-col gap-5 bg-neutral-950 border border-white/10 p-8 rounded-3xl">
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
  // RENDER PRINCIPAL (RESPONSIVE)
  // ==========================================
  return (
    <main className="relative bg-black text-neutral-200 min-h-screen flex flex-col items-center overflow-x-hidden selection:bg-white selection:text-black">
      <div className="absolute w-[600px] h-[600px] bg-neutral-800/10 rounded-full blur-[160px] -top-40 pointer-events-none"></div>

      <header className="relative z-10 text-center mt-16 px-4">
        <h1 className="text-5xl md:text-6xl font-extralight tracking-[0.2em] md:tracking-[0.4em] text-white cursor-pointer" onClick={() => setTab("messages")}>
          AFTERLOOM
        </h1>
        <p className="text-xs font-mono text-neutral-500 tracking-[0.2em] mt-3 uppercase">
          Messages tied to moments.
        </p>
      </header>

      {/* ========== MENSAJES ========== */}
      {tab === "messages" && (
        <div className="relative z-10 mt-12 flex flex-col items-center pb-40 w-full max-w-3xl px-4">
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

          {/* COMPOSER MEJORADO */}
          {showComposer && (
            <div className="w-full flex flex-col gap-4 mb-10 bg-neutral-950 p-6 rounded-2xl border border-white/5 backdrop-blur-xl">
              <label className="text-xs font-mono text-neutral-500 tracking-wider">Recipient</label>
              <div className="relative" ref={suggestionRef}>
                <input
                  type="text"
                  placeholder="Type username..."
                  value={recipientInput}
                  onChange={(e) => {
                    setRecipientInput(e.target.value);
                    setShowSuggestions(true);
                    if (e.target.value === "") setRecipientUsername("");
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm text-white w-full"
                />
                {showSuggestions && recipientSuggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
                    {recipientSuggestions.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => {
                          setRecipientUsername(user.username);
                          setRecipientInput(user.username);
                          setShowSuggestions(false);
                        }}
                        className="flex items-center gap-3 p-3 w-full hover:bg-neutral-800 transition-colors text-left"
                      >
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-10 h-10 rounded-full object-cover border border-white/10"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        ) : (
                          <AvatarFallback username={user.username} size="w-10 h-10" />
                        )}
                        <div>
                          <p className="text-white font-medium">@{user.username}</p>
                          <p className="text-xs text-neutral-500 line-clamp-1">{user.bio || "No bio yet."}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mostrar destinatario seleccionado con claridad */}
              {recipientUsername && (
                <div className="flex items-center gap-2 mt-1 text-xs text-neutral-400">
                  <span>✓ To:</span>
                  <span className="text-white font-mono">@{recipientUsername}</span>
                </div>
              )}

              <label className="text-xs font-mono text-neutral-500 tracking-wider mt-2">Message Type</label>
              <select
                value={messageType}
                onChange={(e) => setMessageType(e.target.value as Message["message_type"])}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm text-white font-mono"
              >
                <option value="normal">Normal Message (Permanent)</option>
                <option value="capsule">Time Capsule (Opens on Date)</option>
                <option value="emotion">Emotional Trigger (Open When Ready)</option>
                <option value="event">Event Message (Life Moment)</option>
                <option value="anonymous">Anonymous Message (Hidden Identity)</option>
                <option value="burn">Burn After Reading (Disappears Forever)</option>
              </select>

              {/* Eliminado bloque de countdown */}

              {messageType === "capsule" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="date"
                    value={capsuleDate}
                    onChange={(e) => setCapsuleDate(e.target.value)}
                    className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm font-mono text-white flex-1"
                  />
                  <input
                    type="time"
                    value={capsuleTime}
                    onChange={(e) => setCapsuleTime(e.target.value)}
                    className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none text-sm font-mono text-white flex-1"
                  />
                </div>
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
                placeholder="Write your message. This cannot be edited or erased."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="bg-black border border-neutral-800 rounded-xl px-4 py-3 outline-none h-40 resize-none text-sm leading-relaxed"
              />

              <button
                onClick={handleSendMessage}
                disabled={isSending}
                className="bg-white text-black font-semibold tracking-widest uppercase text-xs py-3.5 rounded-xl hover:bg-neutral-200 transition mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? "SENDING..." : "SEND MESSAGE"}
              </button>
            </div>
          )}

          {/* LISTADO DE MENSAJES */}
          <div className="flex flex-col gap-6 w-full">
            {(messageTab === "inbox" ? filteredInboxMessages : sentMessages).map((msg) => {
              const lock = getLockStatus(msg);
              const senderDisplay = msg.message_type === "anonymous" && messageTab === "inbox"
                ? msg.anonymous_name || "Anonymous"
                : `@${msg.from_user}`;
              const isCurrentlyBurning = activeBurns.has(msg.id);

              return (
                <div key={msg.id} className="w-full bg-neutral-950/40 p-6 rounded-2xl border border-white/5 flex flex-col gap-2 relative group">
                  <div className="flex justify-between items-center text-xs font-mono text-neutral-500 flex-wrap gap-2">
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

                  <div className="flex justify-between items-center text-[11px] font-mono text-neutral-600 pt-2 border-t border-white/5 flex-wrap gap-2">
                    <span>{new Date(msg.created_at).toLocaleDateString()}</span>
                    {messageTab === "inbox" && !lock.locked && msg.message_type !== "burn" && (
                      <button
                        onClick={() => toggleMessagePublicity(msg.id, msg.is_public)}
                        className={`px-3 py-1 rounded-md transition text-xs ${msg.is_public ? "bg-white text-black font-semibold" : "border border-neutral-800 text-neutral-400 hover:border-neutral-500"}`}
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

      {/* ========== BÚSQUEDA MEJORADA ========== */}
      {tab === "search" && (
        <div className="relative z-10 mt-12 flex flex-col items-center pb-40 w-full max-w-xl px-4">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-950 border border-white/5 rounded-xl px-5 py-3.5 outline-none font-mono text-sm"
          />
          <div className="mt-8 flex flex-col gap-4 w-full">
            {searchResults.map((user) => (
              <div
                key={user.id}
                onClick={() => {
                  setRecipientUsername(user.username);
                  setRecipientInput(user.username);
                  setTab("userProfile");
                }}
                className="w-full border border-white/5 rounded-2xl p-5 bg-neutral-950/60 cursor-pointer hover:border-neutral-700 transition flex items-center gap-4"
              >
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="w-14 h-14 rounded-full object-cover border border-white/10"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <AvatarFallback username={user.username} size="w-14 h-14" />
                )}
                <div className="flex-1">
                  <p className="font-medium text-white">@{user.username}</p>
                  <p className="text-neutral-500 text-xs mt-1 line-clamp-2 italic">{user.bio || "No bio yet."}</p>
                </div>
                <span className="text-neutral-600 font-mono text-xs">View →</span>
              </div>
            ))}
            {searchResults.length === 0 && search.length > 0 && (
              <p className="text-neutral-600 text-center text-sm mt-8">No users found.</p>
            )}
          </div>
        </div>
      )}

      {/* ========== PERFIL PROPIO (EDITAR PERFIL MEJORADO VISUALMENTE) ========== */}
      {tab === "profile" && (
        <div className="relative z-10 mt-12 w-full max-w-xl flex flex-col items-center pb-40 px-4">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="avatar"
              className="w-24 h-24 rounded-full grayscale border border-white/10 object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <AvatarFallback username={profile?.username || "U"} size="w-24 h-24" />
          )}
          <h2 className="text-2xl font-light mt-4 text-white tracking-widest">@{profile?.username}</h2>

          {/* Botón Edit Profile más elegante */}
          <button
            onClick={() => {
              setNewBio(profile?.bio || "");
              setEditingBio(true);
            }}
            className="mt-4 flex items-center gap-2 border border-neutral-700/50 bg-neutral-900/30 backdrop-blur-sm px-5 py-2 rounded-full text-xs font-mono tracking-wider hover:bg-neutral-800/50 transition"
          >
            <span>✎</span> Edit Profile
          </button>

          {editingBio ? (
            <div className="w-full mt-6">
              <textarea
                value={newBio}
                onChange={(e) => setNewBio(e.target.value)}
                rows={3}
                className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white resize-none focus:outline-none focus:border-neutral-500"
                placeholder="Write your bio..."
              />
              <div className="flex gap-3 mt-3 justify-center">
                <button
                  onClick={handleSaveBio}
                  className="px-5 py-2 bg-white text-black rounded-full text-xs font-semibold tracking-wider hover:bg-neutral-200 transition"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingBio(false)}
                  className="px-5 py-2 border border-neutral-800 rounded-full text-xs font-mono hover:border-neutral-500 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-400 mt-4 text-center italic max-w-sm font-light">
              "{profile?.bio || "No bio yet."}"
            </p>
          )}

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
          {selectedProfile?.avatar_url ? (
            <img
              src={selectedProfile.avatar_url}
              alt="avatar"
              className="w-24 h-24 rounded-full grayscale border border-white/10 object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <AvatarFallback username={recipientUsername || "U"} size="w-24 h-24" />
          )}
          <h2 className="text-2xl font-light mt-4 text-white tracking-widest">@{recipientUsername}</h2>
          <p className="text-sm text-neutral-400 mt-4 text-center italic max-w-sm font-light">
            "{selectedProfile?.bio || "No bio yet."}"
          </p>

          <div className="mt-12 flex flex-col gap-6 w-full">
            <div className="border-b border-neutral-800 pb-2 flex justify-between items-center">
              <h3 className="text-xs uppercase font-mono tracking-widest text-neutral-400">Public Messages</h3>
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

      {/* BARRA DE NAVEGACIÓN RESPONSIVE */}
      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-6 md:pb-8 z-20">
        <div className="bg-neutral-950/80 backdrop-blur-md border border-white/5 rounded-full px-6 py-3 md:px-8 md:py-3.5 flex gap-6 md:gap-10 shadow-2xl">
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