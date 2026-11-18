const TICKET_ID = "32087c25-561f-4485-9aba-6bbaa8c697bd";
const API_URL = `http://localhost:8080/api/v1/tickets/${TICKET_ID}/asignar`;

const operarios = [
    { nombre: "Carlos", id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33" },
    { nombre: "Mario",  id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44" }
];

async function intentarAsignar(operario) {
    console.log(`[${operario.nombre}] Intentando aceptar el trabajo...`);
    
    const response = await fetch(API_URL, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operario_id: operario.id })
    });

    const data = await response.json();
    return {
        operario: operario.nombre,
        status: response.status,
        resultado: data
    };
}

async function simularConcurrencia() {
    console.log("Lanzando peticiones simultáneas...\n");
    
    // Promise.all lanza ambas peticiones HTTP exactamente al mismo tiempo
    const resultados = await Promise.all([
        intentarAsignar(operarios[0]),
        intentarAsignar(operarios[1])
    ]);

    console.log("\n--- RESULTADOS DE LA CARRERA ---");
    resultados.forEach(res => {
        if (res.status === 200) {
            console.log(`✅ GANADOR: ${res.operario} (Status ${res.status}) - Ticket asignado exitosamente.`);
        } else {
            console.log(`❌ PERDEDOR: ${res.operario} (Status ${res.status}) - Error:`, res.resultado);
        }
    });
}

simularConcurrencia();