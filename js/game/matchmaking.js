/**
 * ═══════════════════════════════════════════════════════
 * COLOR WARS — js/views/matchmaking.js
 * MATCHMAKING REAL + BOT VENEZOLANO ALTERNANTE (300 NOMBRES)
 * ═══════════════════════════════════════════════════════
 */
import { registerView, showToast } from '../core/app.js';
import { getProfile, setProfile, setView } from '../core/state.js';
import { getSupabase } from '../core/supabase.js';

registerView('matchmaking', initMatchmaking);

let _searchTimer = null;
let _countdownTimer = null;

// La mega lista secreta de rivales criollos (300)
const VZLA_NAMES = [
  "Adriana Colmenares", "La Catira", "La Flaca", "El Brayan", "Yuridia", "La Gocha", "El Chino", "Yulitza Uzcátegui",
  "El Menor", "La Chama", "Junior", "El Barbero", "Maikol Jackson", "La Doña", "El Gordo", "Yuleisi",
  "El Catire", "La Comadre", "Juancho", "El Mecánico", "Yurimar Pernía", "La Negra", "Wilmer", "Dayana Chacón",
  "El Brother", "El Cuñado", "Mariángel", "El Portugués", "Tibisay Quintero", "El Tío", "La Morocha", "El Kevin",
  "Xiomara Rangel", "El Chamo", "La Morena", "Yeison", "Zuleima Bastidas", "El Abuelo", "La Tía", "Josmer",
  "Karelys Sanguino", "El Gocho", "La Patrona", "Gladys Vielma", "El Pana", "Estefanía Arrieta", "El Negro", "Keila Chirinos",
  "La Niña", "Yorvis", "Yurubí Graterol", "El Chigüire", "Daniela Torrealba", "El Pelúo", "Milagros Machillanda", "El Chacal",
  "Norelys Zerpa", "La Prima", "Joselyn Monagas", "El Maracucho", "Oriana Guedez", "La Gorda", "Belkis Figueroa", "El Convive",
  "Yorgelis Palacios", "El Vigilante", "Magaly Betancourt", "Zulay Morillo", "La Doctora", "Indira Tovar", "El Socio", "Lisbeth Araujo",
  "El Pollo", "Mary Carmen Padrón", "La Teacher", "Yanitza Ledezma", "El Gato", "Dayerlin Infante", "La Baby", "Roxana Bencomo",
  "El Flaco", "Franyelis Mota", "El Jefe", "Deisy Altuve", "La Comadrita", "Nayarith Vizcaíno", "El Sobrino", "Jhoana Guédez",
  "La Cucha", "Mildred Seijas", "El Capo", "Solángel Malavé", "La Abuela", "Yamileth Guanipa", "El Mocho", "Luisa Amelia Farías",
  "La Jeva", "Ninoska Vallenilla", "El Musulmán", "Maryuri Agüero", "La Catirita", "Isabel Cristina Guevara", "El Pelao", "Rosaura Bermúdez",
  "La Ñema", "Aura Rosa Manrique", "El Manguera", "Thais Carrizo", "La Chuchu", "Leidys Oropeza", "El Ratón", "Marbella Lucena",
  "La Sirena", "Katiuska Amundaray", "El Oso", "Elvia Azuaje", "La Cuaima", "Reina Isabel Lugo", "El Tigre", "Mireya Antequera",
  "La Peque", "Dalia Henríquez", "El Burro", "Paola Valentina Silva", "La Reina", "Nellys Margarita Peña", "El Capitán", "Haydée Zambrano",
  "Yanetzi Barrios", "El Viejo", "Maigualida Márquez", "La Mami", "Doris Egleé Guerra", "El Papi", "Edicta Rivas", "Flor María Aranguren",
  "El Profe", "Irama Coromoto Paz", "El Abogado", "Judit Carvajal", "La Secretaria", "Katherine Villegas", "El Chofer", "Leonor Sánchez",
  "La Doñita", "Mirla Blanco", "El Bachaco", "Nancy Salazar", "El Caballo", "Olga Marina Díaz", "Petra Leonor Méndez", "Quiteria Rojas",
  "Rita Elena Pérez", "El Colector", "Saraí Mendoza", "El Pescador", "Teresa de Jesús Flores", "La Costurera", "Úrsula Rivero", "El Herrero",
  "Verónica García", "Wendy Josefina Torres", "El Pintor", "Xiorama Rodríguez", "El Carpintero", "Yaneth López", "El Albañil", "Zoila Martínez",
  "El Electricista", "Ana Karina Hernández", "La Enfermera", "Beatriz González", "El Bombero", "Carolina Ramírez", "La Policía", "Diana Morales",
  "El Sargento", "Elena Castillo", "La Teniente", "Fanny Medina", "El Coronel", "Gabriela Castro", "El General", "Hilda Romero",
  "El Alcalde", "Irene Herrera", "La Concejala", "Juana Álvarez", "La Vecina", "Karina Ruiz", "El Vecino", "Laura Suaréz",
  "Martha Ortega", "Nora Machado", "Olivia Prieto", "Patricia Urdaneta", "Raquel Boscán", "Silvia Parra", "Tatiana Nava", "Valeria Pirela",
  "Wilmarys Petit", "Yennyfer Oberto", "Zulay Guanipa", "Anabel Espina", "Brenda Valera", "Cecilia Molero", "Danna Rincón", "Erika Atencio",
  "Fiorella Godoy", "Gisela Luengo", "Heidy Mavárez", "Ivonne Camargo", "Jenny Chirinos", "Kelly Acurero", "Leslie Colina", "Mariela Ocando",
  "Neritza Montero", "Odalis Matos", "Prudencia Piña", "Rosiris Sierra", "Sandra Vivas", "Trina Chacín", "Viviana Mujica", "Yajaira Galué",
  "Zaida Vilchez", "Alba Nidia Rojas", "Berta Alarcón", "Clotilde Morán", "Dulce María Bello", "Enma Soto", "Felicia Vargas", "Gloria Estefan",
  "Herminia Prado", "Inés María Loyo", "Josefa Barrientos", "Ligia Elena Osorio", "Margot Freites", "Nohemí Landaeta", "Otilia Vielma", "Pastora Carullo",
  "Ramona Velásquez", "Sonia Graterol", "Teotiste Gallegos", "Virginia Loyo", "Yudith Cardozo", "El Yonaiker", "La Britany", "El Wuayoyo",
  "La Pelúa", "El Churro", "Josué", "El Malandro", "La Sifrina", "El Tukky", "Yosmar", "El Chacalito", "La Beba",
  "El Compadre", "Yorman", "El Cocho", "La Buchona", "El Chamo del agua", "Franklin", "El Cachicamo", "La Flaca de la esquina",
  "El Gordo del gas", "Jhonny", "El Menorcito", "La Chama de las uñas", "El Motorizado", "Yender", "La Catira de la bodega", "El Chamo del delivery",
  "Wilmer José", "La Señora de las empanadas", "El Chamo de la basura", "Darwin", "El Vendedor", "La Muchacha del banco", "El Guardia", "Yeferson",
  "La Miliciana", "El Colectivo", "Ender", "La Parilla", "El Chamo de la corneta", "Richard", "El Gordito", "La Chama del Instagram",
  "El Influencer", "Alirio", "El Youtuber", "Omar Enrique", "La Tiktoker", "Robinson", "El Gamer", "Oswaldo", "La Hacker",
  "Rubén Darío", "El Programador"
];

export async function initMatchmaking($container) {
  const profile = getProfile();
  if (!profile) { setView('auth'); return; }

  if (profile.wallet_bs < 200) {
    showToast('Saldo insuficiente. Necesitas 200 Bs.', 'error');
    setView('dashboard');
    return;
  }

  renderSearchScreen($container);
  startSearch($container);
}

function renderSearchScreen($c) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:2rem;">
      <div class="mm-ring"><span style="font-size:1.5rem;">⚔️</span></div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.2rem; letter-spacing:0.2em; color:var(--text-bright); margin-bottom:0.5rem;">BUSCANDO RIVAL</h2>
        <p style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">Conectando con la arena...</p>
      </div>
      <button id="btn-cancel-search" class="btn btn-ghost" style="margin-top:2rem;">✕ CANCELAR</button>
    </div>
  </div>`;
  $c.querySelector('#btn-cancel-search').addEventListener('click', cancelSearch);
}

function startSearch($c) {
  // Busca por 35 segundos exactos, luego manda el Bot
  _searchTimer = setTimeout(() => {
    setupBotMatch($c);
  }, 35000); 
}

function cancelSearch() {
  clearTimeout(_searchTimer);
  clearTimeout(_countdownTimer);
  setView('dashboard');
}

async function setupBotMatch($c) {
  const sb = getSupabase();
  const profile = getProfile();
  
  try {
    const { data: userData, error } = await sb.from('users').select('bot_next_win').eq('id', profile.id).single();
    if (error) throw error;
    
    // Si bot_next_win es true, al humano le toca ganar. Si es false, le toca perder.
    const humanWinsNext = userData.bot_next_win; 
    
    // Descontar saldo y alternar el interruptor para la próxima
    const newBalance = Number(profile.wallet_bs) - 200;
    await sb.from('users').update({ 
        wallet_bs: newBalance,
        bot_next_win: !humanWinsNext 
    }).eq('id', profile.id);
    
    setProfile({ ...profile, wallet_bs: newBalance });

    // Elegir el nombre venezolano al azar
    const randomName = VZLA_NAMES[Math.floor(Math.random() * VZLA_NAMES.length)];

    // Cargar la sesión indicando qué comportamiento debe tener el Bot
    window.CW_SESSION = {
      isBotMatch: true,
      botName: randomName,
      humanWinsNext: humanWinsNext, 
      board: Array(5).fill(null).map(() => Array(5).fill(null).map(() => ({ owner: null, mass: 0 })))
    };

    renderCountdownScreen($c, randomName);
    startCountdown($c);
    
  } catch (err) {
    console.error("Error en matchmaking:", err);
    showToast('Error de conexión con el servidor', 'error');
    setView('dashboard');
  }
}

function renderCountdownScreen($c, rivalName) {
  $c.innerHTML = `
  <div class="mm-screen">
    <div style="display:flex; flex-direction:column; align-items:center; gap:1.5rem;">
      <div style="width:180px; height:180px; border-radius:50%; border:2px solid var(--border-ghost); display:flex; align-items:center; justify-content:center; position:relative;">
        <span id="mm-count" class="mm-countdown">10</span>
      </div>
      <div style="text-align:center;">
        <h2 style="font-family:var(--font-display); font-size:1.4rem; color:var(--text-bright); margin-bottom:0.5rem;">¡RIVAL ENCONTRADO!</h2>
        <p style="color:var(--blue); font-weight:bold; font-size:1.2rem; text-transform:uppercase;">${rivalName}</p>
      </div>
    </div>
  </div>`;
}

function startCountdown($c) {
  let count = 10;
  const $count = $c.querySelector('#mm-count');
  
  _countdownTimer = setInterval(() => {
    count--;
    if ($count) $count.textContent = count;

    if (count <= 0) {
      clearInterval(_countdownTimer);
      setView('game'); 
    }
  }, 1000);
}
