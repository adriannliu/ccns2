"use client";

import { useEffect, useState } from "react";
import { resolveRoomImage } from "@/lib/imageCache";

interface CachedRoomImageProps {
  roomId: string;
  src: string;
  index?: number;
  alt: string;
  className?: string;
}

export default function CachedRoomImage({
  roomId,
  src,
  index = 0,
  alt,
  className = "",
}: CachedRoomImageProps) {
  const [resolved, setResolved] = useState(src);

  useEffect(() => {
    let active = true;
    void resolveRoomImage(roomId, src, index).then((url) => {
      if (active) setResolved(url);
    });
    return () => {
      active = false;
    };
  }, [roomId, src, index]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolved} alt={alt} className={className} />
  );
}
