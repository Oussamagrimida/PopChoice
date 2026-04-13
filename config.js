import { createClient } from "@supabase/supabase-js";
import Groq from "groq-sdk";

//**Grok config */
const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
if (!groqApiKey) throw new Error("Expected env var VITE_GROQ_API_KEY");

export const groq = new Groq({ 
  apiKey: groqApiKey, 
  dangerouslyAllowBrowser: true  // ✅ required for frontend use
});

//**Supabase config */
const privateKey = import.meta.env.VITE_SUPABASE_API_KEY;
if (!privateKey) throw new Error(`Expected env var VITE_SUPABASE_API_KEY`);
const url = import.meta.env.VITE_SUPABASE_URL;
if (!url) throw new Error(`Expected env var VITE_SUPABASE_URL`);
export const supabase = createClient(url, privateKey);

// helper to call your backend for embeddings
export async function getEmbedding(text) {
  const response = await fetch('http://localhost:3000/embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const { embedding } = await response.json();
  return embedding;
}
// TMDB
const TMDB_KEY  = import.meta.env.VITE_TMDB_API_KEY;
const IMG_BASE  = 'https://image.tmdb.org/t/p/w500';

export async function getMoviePoster(title, year) {
  try {
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&year=${year}`;
    const res  = await fetch(url);
    const data = await res.json();
    const movie = data.results?.[0];
    return movie?.poster_path ? IMG_BASE + movie.poster_path : null;
  } catch (err) {
    console.error('TMDB API error for', err);
    return null;
  }
}