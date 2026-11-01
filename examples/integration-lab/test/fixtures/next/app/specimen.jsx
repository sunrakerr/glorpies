'use client';
import { useState } from 'react';
import { Glorpie, Avatar, AvatarImage, AvatarFallback } from 'glorpies/react';
export default function Specimen() {
  const [name, setName] = useState(42);
  return <><Glorpie name={name} size={96} look="ink" alive={false} label="SSR specimen" /><button onClick={() => setName('42')}>String seed</button><Avatar size={48}><AvatarImage src="/missing-photo.png" alt="Guest" /><AvatarFallback name="guest" alive={false} /></Avatar></>;
}
