"use client";

type MessageCardProps = {
  title: string;
  timer: string;
  message: string;
};

export default function MessageCard({
  title,
  timer,
  message,
}: MessageCardProps) {

  return (

    <div className="border border-white/10 rounded-3xl p-6 w-[340px] bg-white/5 backdrop-blur-xl shadow-2xl">

      <p className="text-sm text-gray-400">
        MESSAGE
      </p>

      <h2 className="text-2xl mt-3 font-semibold">
        {title}
      </h2>

      <p className="text-lg mt-6 text-gray-400">
        {timer}
      </p>

      <p className="mt-6 text-white">
        {message}
      </p>

    </div>

  );

}