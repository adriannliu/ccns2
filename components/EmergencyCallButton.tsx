import { Phone } from "lucide-react";

interface EmergencyCallButtonProps {
  className?: string;
}

/** Prominent emergency dial control (uses tel:911 on supported devices). */
export default function EmergencyCallButton({
  className = "",
}: EmergencyCallButtonProps) {
  return (
    <a
      href="tel:911"
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-500 bg-red-600 py-4 text-base font-bold text-white shadow-[0_0_24px_rgba(220,38,38,0.35)] transition active:scale-[0.99] hover:bg-red-500 ${className}`}
    >
      <Phone className="h-5 w-5" aria-hidden />
      Call 911
    </a>
  );
}
