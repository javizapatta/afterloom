"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useEffect, useState } from "react";
import MessageCard from "@/app/components/MessageCard";
import { supabase } from "@/app/lib/supabase";

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

const [username, setUsername] = useState("");
const [bio, setBio] = useState("");

  const [time, setTime] = useState(36500000);

  const [tab, setTab] = useState("messages");
  const [messageTab, setMessageTab] = useState("inbox");

  const [search, setSearch] = useState("");
  const [following, setFollowing] = useState<string[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const [selectedUser, setSelectedUser] = useState("");

  const [showComposer, setShowComposer] = useState(false);
  const [messageType, setMessageType] = useState("private");
  const [timerOption, setTimerOption] = useState("1hour");

  useEffect(() => {

  supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
});

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((_event, session) => {
  setSession(session);
});const interval = setInterval(() => {
    setTime((prev) => prev - 1);
  }, 1000);

  const fetchMessages = async () => {

    const { data, error } = await supabase
      .from("messages")
.select("*")
.order("id", { ascending: false });

    if (data) {

      const formattedMessages = data.map((message: any) => ({
        from: message.from_user,
        to: message.to_user,
        title: message.title,
        timer: "Available anytime",
        message: message.message,
        public: message.is_public,
      }));

      setMessages(formattedMessages);

    }

  };

  fetchMessages();
  const fetchProfile = async () => {

  if (!session?.user) return;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (data) {
    setProfile(data);
  }

};

fetchProfile();
const fetchUsers = async () => {

  const { data } = await supabase
    .from("profiles")
    .select("*");

  if (data) {
    setUsers(data);
  }

};

fetchUsers();

  return () => {
  clearInterval(interval);
  subscription.unsubscribe();
};

}, [session?.user?.id]);

  const days = Math.floor(time / 86400);
  const hours = Math.floor((time % 86400) / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = time % 60;

const [messages, setMessages] = useState<any[]>([]);

const [users, setUsers] = useState<any[]>([]);

 const filteredUsers = users.filter((user) =>
  user.username.toLowerCase().includes(search.toLowerCase())
);

 const inboxMessages = messages.filter(
  (message) => message.to === profile?.username
);

const sentMessages = messages.filter(
  (message) => message.from === profile?.username
);

const publicMessages = messages.filter(
  (message) =>
    message.from === profile?.username &&
    message.public === true
);


const selectedProfile = users.find(
  (user) => user.username === selectedUser
);

const selectedUserMessages = messages.filter(
  (message) =>
    message.from === selectedUser &&
    message.public === true
);
if (session && !profile) {

  return (

    <main className="bg-black text-white min-h-screen flex items-center justify-center">

      <div className="w-[380px] flex flex-col gap-4">

        <h1 className="text-4xl font-bold text-center mb-6">
          Create Profile
        </h1>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none"
        />

        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none h-32 resize-none"
        />

        <button
          onClick={async () => {

            const { error } = await supabase
              .from("profiles")
              .insert([
                {
                  id: session.user.id,
                  username,
                  bio,
                  avatar_url: session.user.user_metadata.avatar_url,
                },
              ]);

        if (!error) {

  window.location.reload();

}

          }}
          className="border border-white px-4 py-3 rounded-full hover:bg-white hover:text-black transition"
        >
          Continue
        </button>

      </div>

    </main>

  );

}
  if (!session) {

  return (

    <main className="bg-black text-white min-h-screen flex items-center justify-center">

      <div className="w-[380px]">

        <h1 className="text-5xl font-bold mb-10 text-center">
          AFTERLOOM
        </h1>

        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          providers={["google"]}
          theme="dark"
        />

      </div>

    </main>

  );

}
  return (

    <main className="relative bg-black text-white min-h-screen flex flex-col items-center overflow-hidden">

      <div className="absolute w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl"></div>

      <h1 className="relative z-10 text-7xl font-bold tracking-widest mt-16">
        AFTERLOOM
      </h1>

      <p className="relative z-10 text-gray-400 mt-4 text-lg">
        Every message has its moment.
      </p>

      {/* MESSAGES */}

      {tab === "messages" && (

        <div className="relative z-10 mt-12 flex flex-col items-center pb-40">

          <div className="flex gap-6 mb-8">

            <button
              onClick={() => setMessageTab("inbox")}
              className={`${messageTab === "inbox"
                ? "text-white"
                : "text-gray-500"} transition`}
            >
              Inbox
            </button>

            <button
              onClick={() => setMessageTab("sent")}
              className={`${messageTab === "sent"
                ? "text-white"
                : "text-gray-500"} transition`}
            >
              Sent
            </button>

          </div>

       {messageTab === "sent" ? (

  <button
    onClick={() => setShowComposer(!showComposer)}
    className="mb-8 border border-white px-4 py-3 rounded-full hover:bg-white hover:text-black transition"
  >
    {showComposer ? "Close" : "+ New Message"}
  </button>

) : null}

          {showComposer && (

            <div className="w-[340px] flex flex-col gap-4 mb-10">

              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl"
              >

                <option value="">
                  Choose user
                </option>

                {users
  .filter((user) => user.username !== profile?.username)
  .map((user, index) => (

<option key={index} value={user.username}>
  @{user.username}
</option>

                ))}

              </select>

              <input
                type="text"
                placeholder="Message title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl"
              />

              <textarea
                placeholder="Write your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl h-32 resize-none"
              />
             <select
  value={messageType}
  onChange={(e) => setMessageType(e.target.value)}
  className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl"
>

  <option value="private">
    Private Message
  </option>

  <option value="public">
    Public Message
  </option>

  <option value="timed">
    Timed Message
  </option>

  <option value="anonymous">
    Anonymous Message
  </option>

</select>

{messageType === "timed" && (

  <select
    value={timerOption}
    onChange={(e) => setTimerOption(e.target.value)}
    className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl"
  >

    <option value="1hour">
      Opens in 1 Hour
    </option>

    <option value="1day">
      Opens in 1 Day
    </option>

    <option value="1week">
      Opens in 1 Week
    </option>

  </select>

)}

              <button
                onClick={async () => {

                  if (!selectedUser) return;
                  if (selectedUser === profile?.username) {
  alert("You cannot message yourself");
  return;
}

                const { data, error } = await supabase
  .from("messages")
  .insert([
    {
      from_user: profile?.username,
      to_user: selectedUser,
      title: newTitle,
      message: newMessage,
      is_public: messageType === "public",
message_type: messageType,
    },
  ]);

console.log(data);
console.log(error);

                  const createdMessage = {
                    from: profile?.username,
                    to: selectedUser,
                    title: newTitle,
                    timer: "Available anytime",
                    message: newMessage,
                    public: messageType === "public",
type: messageType,
                  };

                  setMessages([createdMessage, ...messages]);

                  setNewTitle("");
                  setNewMessage("");

                  setShowComposer(false);

                }}
                className="border border-white px-4 py-3 rounded-full hover:bg-white hover:text-black transition"
              >
                Send Message
              </button>

            </div>

          )}

          <div className="flex flex-col gap-6">

            {(messageTab === "inbox"
              ? inboxMessages
              : sentMessages
            ).map((message, index) => (

              <div key={index}>

                <p className="text-sm text-gray-500 mb-2">

                  {messageTab === "inbox"
                    ? `From: ${message.from}`
                    : `To: ${message.to}`}

                </p>

                <MessageCard
                  title={message.title}
                  timer={message.timer}
                  message={message.message}
                />

              </div>

            ))}

          </div>

        </div>

      )}

      {/* SEARCH */}

      {tab === "search" && (

        <div className="relative z-10 mt-12 flex flex-col items-center pb-40">

          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[340px] bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none backdrop-blur-xl"
          />

          <div className="mt-6 flex flex-col gap-4">

            {filteredUsers.map((user, index) => {

  if (user.username === profile?.username) return null;

  return (

              <div
                key={index}
                onClick={() => {
                  setSelectedUser(user.username);
                  setTab("userProfile");
                }}
                className="w-[340px] border border-white/10 rounded-3xl p-6 bg-white/5 backdrop-blur-xl cursor-pointer"
              >

                <p className="text-xl font-semibold">
                  @{user.username}
                </p>

                <p className="text-gray-400 mt-2">
                  Profile available
                </p>

                <button
                  onClick={(e) => {

                    e.stopPropagation();

                    if (following.includes(user.username)) {

                      setFollowing(
                        following.filter((u) => u !== user.username)
                      );

                    } else {

                      setFollowing([...following, user.username]);

                    }

                  }}
                  className="mt-4 border border-white px-4 py-2 rounded-full hover:bg-white hover:text-black transition"
                >
                  {following.includes(user.username)
                    ? "Following"
                    : "Follow"}
                </button>

              </div>

              );
})}

          </div>

        </div>

      )}

      {/* PROFILE */}

      {tab === "profile" && (

        <div className="relative z-10 mt-12 w-full max-w-md flex flex-col items-center pb-40">

          <img
  src={profile?.avatar_url}
  className="w-24 h-24 rounded-full object-cover"
/>

  <h2 className="text-3xl mt-6 font-bold">
  @{profile?.username}
</h2>

<p className="text-gray-400 mt-2">
  {profile?.bio}
</p>

          <p className="text-gray-400 mt-2">
  {inboxMessages.length} messages received
</p>

<button
  onClick={async () => {
    await supabase.auth.signOut();
    window.location.reload();
  }}
  className="absolute top-6 right-6 border border-white/10 bg-white/5 backdrop-blur-xl w-10 h-10 rounded-xl text-sm hover:bg-white hover:text-black transition"
>
  ↗
</button>

<div className="mt-8 flex flex-col gap-6">

  {publicMessages.map((message, index) => (

    <MessageCard
      key={index}
      title={message.title}
      timer={message.timer}
      message={message.message}
    />

  ))}

</div>

        </div>

      )}

      {/* USER PROFILE */}

      {tab === "userProfile" && (

        <div className="relative z-10 mt-12 flex flex-col items-center pb-40">

          <img
  src={selectedProfile?.avatar_url}
  className="w-24 h-24 rounded-full object-cover"
/>

          <h2 className="text-3xl mt-6 font-bold">
            @{selectedUser}
          </h2>

         <p className="text-gray-400 mt-2">
  {selectedProfile?.bio}
</p>
<button
  onClick={() => {

    if (following.includes(selectedUser)) {

      setFollowing(
        following.filter((u) => u !== selectedUser)
      );

    } else {

      setFollowing([...following, selectedUser]);

    }

  }}
  className="mt-6 border border-white px-4 py-2 rounded-full hover:bg-white hover:text-black transition"
>
  {following.includes(selectedUser)
    ? "Following"
    : "Follow"}
</button>
<div className="mt-8 flex flex-col gap-6">

  {selectedUserMessages.map((message, index) => (

    <MessageCard
      key={index}
      title={message.title}
      timer={message.timer}
      message={message.message}
    />

  ))}

</div>
          

        </div>

      )}

      {/* NAVBAR */}

      <div className="fixed bottom-0 left-0 w-full flex justify-center pb-8 z-20">

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-full px-6 py-4 flex gap-8">

          <button
            onClick={() => setTab("messages")}
            className={`${tab === "messages"
              ? "text-white"
              : "text-gray-500"} transition`}
          >
            Messages
          </button>

          <button
            onClick={() => setTab("search")}
            className={`${tab === "search"
              ? "text-white"
              : "text-gray-500"} transition`}
          >
            Search
          </button>

          <button
            onClick={() => setTab("profile")}
            className={`${tab === "profile"
              ? "text-white"
              : "text-gray-500"} transition`}
          >
            Profile
          </button>

        </div>

      </div>

    </main>

  );

}