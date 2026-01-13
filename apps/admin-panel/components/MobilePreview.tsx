'use client';

interface MobilePreviewProps {
  primaryColor: string;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
}

export function MobilePreview({
  primaryColor,
  logoUrl,
  backgroundUrl,
}: MobilePreviewProps) {
  return (
    <div className="flex justify-center">
      <div className="relative w-[280px] h-[600px] bg-[#1A1A1A] rounded-[40px] p-2 shadow-2xl">
        {/* Phone Frame */}
        <div
          className="w-full h-full rounded-[32px] overflow-hidden relative"
          style={{
            background: backgroundUrl
              ? `url(${backgroundUrl}) center/cover`
              : 'linear-gradient(180deg, #000000 0%, #0A0E1A 50%, #000000 100%)',
          }}
        >
          {/* Mock Home Screen Content */}
          <div className="p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-8 w-auto"
                />
              ) : (
                <div
                  className="h-8 w-8 rounded-lg"
                  style={{ backgroundColor: primaryColor }}
                />
              )}
              <div
                className="px-4 py-2 rounded-lg text-sm font-bold"
                style={{
                  backgroundColor: `${primaryColor}20`,
                  color: primaryColor,
                }}
              >
                1,250 💧
              </div>
            </div>

            {/* Daily Challenge Card */}
            <div
              className="mb-4 p-4 rounded-xl backdrop-blur-sm"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${primaryColor}40`,
              }}
            >
              <h3
                className="text-sm font-bold mb-2 uppercase tracking-wide"
                style={{ color: primaryColor }}
              >
                Daily Challenge
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-lg font-bold">500 drops</p>
                  <p className="text-gray-400 text-xs">to next reward</p>
                </div>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: `${primaryColor}20`,
                    border: `2px solid ${primaryColor}`,
                  }}
                >
                  <span className="text-2xl">💧</span>
                </div>
              </div>
            </div>

            {/* Rewards Store Card */}
            <div
              className="mb-4 p-4 rounded-xl backdrop-blur-sm"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <h3 className="text-sm font-bold text-white mb-2">Rewards Store</h3>
              <p className="text-gray-400 text-xs">
                Redeem your drops for exclusive rewards
              </p>
            </div>

            {/* Leaderboards Card */}
            <div
              className="p-4 rounded-xl backdrop-blur-sm"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <h3 className="text-sm font-bold text-white mb-2">Leaderboards</h3>
              <p className="text-gray-400 text-xs">
                Compete with others in your gym
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
