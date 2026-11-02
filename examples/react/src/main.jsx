import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Glorpie } from 'glorpies/react';
import './style.css';

function App() {
  const [name, setName] = useState('sunrakerrisfriednoodlz');
  const [look, setLook] = useState('watercolour');
  return (
    <main>
      <h1>Meet your Glorpie</h1>
      <p>Same name. Same face. Every time.</p>
      <div className="face">
        <Glorpie
          name={name}
          look={look}
          size={192}
          pokeable
          label={`An alien avatar for ${name || 'an empty name'}`}
        />
      </div>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Look
        <select value={look} onChange={(event) => setLook(event.target.value)}>
          <option>watercolour</option>
          <option>gouache</option>
          <option>sticker</option>
          <option>ink</option>
        </select>
      </label>
      <a href="https://glorpies.sunrakerr.dev/docs/react">React documentation →</a>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
