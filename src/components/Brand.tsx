export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand brand--compact" : "brand"} role="img" aria-label="Helmora">
      <span className="brand__picture" aria-hidden="true">
        <img className="brand__light" src={compact ? "/logo/helmora_logo_black.png" : "/logo/helmora_full_black.png"} alt="" />
        <img className="brand__dark" src={compact ? "/logo/helmora_logo_white.png" : "/logo/helmora_full_white.png"} alt="" />
      </span>
    </span>
  );
}
