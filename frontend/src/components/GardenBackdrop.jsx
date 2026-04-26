// Floating leaf/blob decorations for page backdrops.
// Pure SVG, fixed position, pointer-events none.
export function GardenBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <Blob className="absolute -top-24 -left-20 w-[420px] opacity-50 animate-float-slow" fill="#B6E7C9" />
      <Blob className="absolute -top-10 right-[-120px] w-[360px] opacity-40 animate-float" fill="#F5F0E0" />
      <Blob className="absolute bottom-[-160px] left-1/3 w-[520px] opacity-35 animate-float-slow" fill="#CADBBC" />
      <Leaf className="absolute top-[14%] right-[8%] w-20 opacity-50 animate-sway" />
      <Leaf className="absolute top-[55%] left-[4%] w-24 opacity-40 animate-sway" rotate={-30} />
      <Leaf className="absolute bottom-[10%] right-[12%] w-16 opacity-50 animate-sway" rotate={150} />
    </div>
  );
}

function Blob({ className, fill }) {
  return (
    <svg viewBox="0 0 200 200" className={className}>
      <path
        d="M44.6,-65.2C57.2,-58.4,66.5,-45.1,71.8,-30.7C77.1,-16.3,78.4,-0.7,73.7,12.7C69,26.1,58.3,37.3,46.1,47.6C33.8,57.9,20.1,67.4,4.5,72.4C-11,77.3,-28.4,77.7,-41.5,69.7C-54.7,61.7,-63.6,45.2,-69.1,28.4C-74.6,11.7,-76.7,-5.4,-71.7,-19.9C-66.7,-34.4,-54.5,-46.4,-41,-53.5C-27.5,-60.6,-13.7,-62.8,1.3,-64.7C16.4,-66.6,32.7,-72,44.6,-65.2Z"
        transform="translate(100 100)"
        fill={fill}
      />
    </svg>
  );
}

function Leaf({ className, rotate = 0 }) {
  return (
    <svg viewBox="0 0 64 64" className={className} style={{ transform: `rotate(${rotate}deg)` }}>
      <path
        d="M32 4 C 14 12, 6 30, 12 52 C 32 50, 52 36, 56 12 C 48 8, 40 6, 32 4 Z"
        fill="url(#leafG)"
      />
      <path d="M22 44 Q 32 30, 50 16" stroke="#157554" strokeWidth="1.2" fill="none" opacity="0.45" />
      <defs>
        <linearGradient id="leafG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#85D4A6" />
          <stop offset="100%" stopColor="#157554" />
        </linearGradient>
      </defs>
    </svg>
  );
}
