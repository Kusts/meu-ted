/**
 * Splash — PWA startup screen (item premium 3).
 *
 * Mascot 72x72 centered over #0B0F0E with a subtle spring, check drawing
 * (stroke-dashoffset) and "Meu Ted" + "Tudo em dia." in #E8EFEA.
 * CSS animation only (no heavy JS); decorative motion honors
 * prefers-reduced-motion via .splash-* classes. Used as the standalone
 * loading screen (AuthGate) and safe-area aware.
 */
export function Splash() {
  return (
    <main
      className="flex h-dvh flex-col items-center justify-center gap-5"
      style={{
        backgroundColor: "#0B0F0E",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Carregando Meu Ted"
    >
      <svg
        width={72}
        height={72}
        viewBox="0 0 64 64"
        role="img"
        aria-hidden="true"
        className="splash-mascot"
      >
        <circle cx="32" cy="32" r="30" fill="#1F2A27" />
        <circle cx="20" cy="17" r="6.5" fill="#66C2A3" />
        <circle cx="44" cy="17" r="6.5" fill="#66C2A3" />
        <path
          d="M18 44 L18 32 L26 40 L32 28 L38 40 L46 32 L46 44"
          fill="none"
          stroke="#66C2A3"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M25 52 l5 5 L41 45"
          fill="none"
          stroke="#E8EFEA"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="splash-check"
        />
      </svg>
      <div className="flex flex-col items-center gap-1">
        <span
          className="text-[22px] font-extrabold tracking-tight"
          style={{ color: "#E8EFEA" }}
        >
          Meu Ted
        </span>
        <span
          className="text-[12px] font-semibold tracking-[0.18em] uppercase"
          style={{ color: "#E8EFEA", opacity: 0.7 }}
        >
          Tudo em dia.
        </span>
      </div>
    </main>
  );
}

export default Splash;
