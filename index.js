import { groq, supabase, getEmbedding , getMoviePoster } from './config.js';

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
const state = {
  numPeople: 1,
  duration: '',
  personAnswers: [],
  currentPerson: 0,
  movies: [],         // ← ADD
  currentMovie: 0,    // ← ADD
};

// ─────────────────────────────────────────
// SCREEN SWITCHER
// ─────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen')
    .forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─────────────────────────────────────────
// PILL HELPERS
// ─────────────────────────────────────────
function initPills(containerId) {
  document.querySelectorAll(`#${containerId} .pill`).forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll(`#${containerId} .pill`)
        .forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
    });
  });
}

function getPill(containerId) {
  return document.querySelector(`#${containerId} .pill.selected`)
    ?.dataset.value || '';
}

// ─────────────────────────────────────────
// SCREEN 1 — START
document.getElementById('btn-start').addEventListener('click', () => {
  const n = parseInt(document.getElementById('num-people').value);
  const d = document.getElementById('duration').value.trim();

  if (!n || n < 1) return alert('Enter number of people');
  if (!d) return alert('Enter how much time you have');

  state.numPeople = n;
  state.duration = d;
  state.personAnswers = [];
  state.currentPerson = 0;

  loadPersonScreen();          
  showScreen('screen-person');
});

// ─────────────────────────────────────────
// SCREEN 2 — PER-PERSON QUESTIONS
// ─────────────────────────────────────────
initPills('p-pills-era');                                             // ✅ fixed
initPills('p-pills-mood');                                            // ✅ fixed

function loadPersonScreen() { 
  const i = state.currentPerson;
  const numEl = document.getElementById('person-num');

  // only show person number if more than 1 person
  if (state.numPeople > 1) {
    numEl.textContent = i + 1;
    numEl.style.display = 'block';
  } else {
    numEl.style.display = 'none'; 
  }

  //Clear inputs
  document.getElementById('p-fav-movie').value = '';                  
  document.getElementById('p-island').value = '';                     
  document.querySelectorAll('#p-pills-era .pill, #p-pills-mood .pill') 
    .forEach(p => p.classList.remove('selected'));

  //last person button text 
  const isLast = i === state.numPeople - 1;
  document.getElementById('btn-next-person').textContent =
    isLast ? 'Get Movie' : 'Next Person';
}


document.getElementById('btn-next-person').addEventListener('click', () => {
  // REQUIRED — must pick era pill
  const era = getPill('p-pills-era');
  if (!era) return alert('Please select an era — New, Classic, or Either');

  // REQUIRED — must pick mood pill  
  const mood = getPill('p-pills-mood');
  if (!mood) return alert('Please select a mood — Fun, Serious, Inspiring, or Scary');

  // OPTIONAL — can be empty
  const favMovie = document.getElementById('p-fav-movie').value.trim();
  const island = document.getElementById('p-island').value.trim();

  // save answers (required fields guaranteed, optional may be empty)
  state.personAnswers.push({
    favMovie: favMovie || 'not specified',
    era,
    mood,
    island: island || 'not specified',
  });

  state.currentPerson++;

  if (state.currentPerson >= state.numPeople) {
    runAI();
  } else {
    loadPersonScreen();
  }
});

// ─────────────────────────────────────────
// SCREEN 3 — LOADING + AI PIPELINE
// ─────────────────────────────────────────
const loadingMessages = [
  "Analyzing your group's taste…",
  'Searching the movie universe…',
  'Finding the perfect match…',
  'Almost there…'
];

async function runAI() {
  showScreen('screen-loading');

  let msgIndex = 0;
  const msgEl = document.getElementById('loading-text');
  const msgInterval = setInterval(() => {
    msgEl.textContent = loadingMessages[msgIndex % loadingMessages.length];
    msgIndex++;
  }, 1800);

  try {
    const text = buildTextForEmbedding();
    console.log('Embedding text:', text);

    const vector = await getEmbedding(text);
    console.log('Got vector, length:', vector.length);

    const { data: similarMovies, error } = await supabase.rpc('match_movies', {
      query_embedding: vector,
      match_threshold: 0.5, 
      match_count: 3
    });
    if (error) throw new Error('Supabase error: ' + error.message);
    console.log('Similar movies found:', similarMovies);

    const prompt = buildPrompt(similarMovies);

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    console.log('Movies result:', parsed);

    const moviesWithPosters = await Promise.all(
      parsed.movies.map(async (movie) => {
        const poster = await getMoviePoster(movie.title, movie.year);
        return { ...movie, poster };
      })
    )
    if (moviesWithPosters.poster === null){
      console.log('No poster found for', movie.title);
    }
    state.movies = moviesWithPosters;
    state.currentMovie = 0;
    
    clearInterval(msgInterval);
    showResult();   // no argument needed anymore
  } catch (err) {
    clearInterval(msgInterval);
    console.error('AI pipeline error:', err);
    document.getElementById('result-title').textContent = 'Something went wrong';
    document.getElementById('result-desc').textContent = err.message;
    showScreen('screen-result');
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function buildTextForEmbedding() {
  const lines = [
    `${state.numPeople} people watching, time available: ${state.duration}`,
  ];

  state.personAnswers.forEach((p, i) => {
    lines.push(
      `Person ${i + 1}: favorite movie is ${p.favMovie || 'unspecified'}, ` +
      `era: ${p.era || 'any'}, mood: ${p.mood || 'any'}, ` +
      `would be stranded with: ${p.island || 'unspecified'}`
    );
  });

  return lines.join('. ');
}

function buildPrompt(similarMovies) {
  const movieContext = similarMovies
    .map(m => `- ${m.title}: ${m.content}`)
    .join('\n');

  const personLines = state.personAnswers
    .map((p, i) => `  Person ${i+1}: likes "${p.favMovie}", mood: ${p.mood}, era: ${p.era}`)
    .join('\n');

  return `You are PopChoice, a movie recommendation AI for groups.

Here are movies from our curated database that closely match this group's taste:
${movieContext}

Details:
- Number of people: ${state.numPeople}
- Time available: ${state.duration}

Individual preferences:
${personLines}

Pick the 2 best movies from the database list above that satisfy everyone.
Respond with ONLY this JSON, no extra text:
{
  "movies": [
    {
      "title": "Movie Title",
      "year": "2022",
      "description": "1 sentence description.",
      "why": "One sentence why this group will love it."
    },
    {
      "title": "Movie Title 2",
      "year": "2019",
      "description": "1 sentence description.",
      "why": "One sentence why this group will love it."
    }
  ]
}`;
}

// ─────────────────────────────────────────
// SCREEN 4 — RESULT
// ─────────────────────────────────────────
function showResult() {
  const movie = state.movies[state.currentMovie];
  const isLast = state.currentMovie === state.movies.length - 1;

  document.getElementById('result-title').textContent =
    `${movie.title} (${movie.year})`;
  document.getElementById('result-desc').textContent =
    `${movie.description} ${movie.why}`;

  const posterEl = document.getElementById('result-poster');
  if (movie.poster) {
    posterEl.src = movie.poster;
    posterEl.style.display = 'block';
  } else {
    posterEl.style.display = 'none';
  }

  // ONE button — changes label and behavior based on position
  const actionBtn = document.getElementById('btn-result-action');
  if (isLast) {
    actionBtn.textContent = 'Go Again';
    actionBtn.onclick = goAgain;         // ← swap the handler
  } else {
    actionBtn.textContent = 'Next Movie';
    actionBtn.onclick = () => {
      state.currentMovie++;
      showResult();
    };
  }

  showScreen('screen-result');
}

function goAgain() {
  state.numPeople = 1;
  state.duration = '';
  state.personAnswers = [];
  state.currentPerson = 0;
  state.movies = [];
  state.currentMovie = 0;

  document.getElementById('num-people').value = '';
  document.getElementById('duration').value = '';
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));

  showScreen('screen-start');
}

// wire the go-again button (now only exists on result screen as btn-result-action)
// no separate addEventListener needed — handled inside showResult() via onclick
// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
showScreen('screen-start');