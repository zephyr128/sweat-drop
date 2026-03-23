export default function SuperLoading() {
  return (
    <div className="md:p-6 animate-pulse">
      <div className="h-7 w-44 bg-zinc-800 rounded-lg mb-2" />
      <div className="h-4 w-64 bg-zinc-800/60 rounded mb-8" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-5 h-24" />
        ))}
      </div>
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl h-64" />
    </div>
  );
}
