import React from 'react';
import { createRoot } from 'react-dom/client';
import { Glorpie, Avatar, AvatarFallback, AvatarImage } from 'glorpies/react';

export function start(stage, options, error, kind) {
  const root = createRoot(stage);
  const update = (props) => root.render(kind === 'avatar'
    ? <Avatar size={props.size} shape={props.shape}><AvatarImage src={props.photo} alt="Test photo" /><AvatarFallback {...props} onError={error} /></Avatar>
    : <Glorpie {...props} onError={error} />);
  update(options);
  return { update, destroy: () => root.unmount() };
}
