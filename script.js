// Variáveis globais
let notifications = [];
let chart = null;

// Função para inicializar a página
document.addEventListener('DOMContentLoaded', function() {
    fetchNotifications();
    setInterval(fetchNotifications, 10000); // Atualiza a cada 10 segundos
    document.getElementById('search-btn').addEventListener('click', filterNotifications);
    document.getElementById('search-input').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') filterNotifications();
    });
    document.getElementById('clear-btn').addEventListener('click', clearNotifications);
    document.getElementById('app-filter').addEventListener('change', filterNotifications); // Garante listener no filtro
    initChart();
});

// Busca notificações do servidor
function fetchNotifications() {
    fetch('/notifications')
        .then(response => response.json())
        .then(data => {
            // Compara IDs para verificar se houve mudança real
            const currentIds = notifications.map(n => n.id).sort().join(',');
            const newIds = data.map(n => n.id).sort().join(',');

            if (currentIds !== newIds || notifications.length !== data.length) {
                console.log("Dados de notificação alterados, atualizando UI.");
                notifications = data;
                updateNotificationsList();
                updateStats();
                updateChart();
                updateAppFilter();
            }
        })
        .catch(error => console.error('Erro ao buscar notificações:', error));
}

// Função para criar links
function linkify(inputText) {
    if (!inputText) return '';
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    const replacer = (url) => {
        let href = url;
        if (url.startsWith('www.')) { href = 'http://' + url; }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    };
    return inputText.replace(urlPattern, replacer);
}

// --- FUNÇÃO PRINCIPAL PARA ATUALIZAR A LISTA NA UI ---
function updateNotificationsList(filteredData = null) {
    const container = document.getElementById('notifications-container');
    const dataToShow = filteredData || notifications;
    container.innerHTML = ''; // Limpa a lista atual

    if (dataToShow.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma notificação encontrada.</p>';
        return;
    }

    dataToShow.forEach(notification => {
        // Pula a notificação se ela não tiver um ID (essencial para exclusão)
        if (!notification.id) {
            console.warn("Notificação sem ID encontrada, pulando:", notification);
            return;
        }

        // 1. Cria o Card Principal
        const card = document.createElement('div');
        card.className = 'notification-card';
        card.dataset.notificationId = notification.id; // Guarda o ID no elemento do card

        // 2. Cria o Cabeçalho
        const header = document.createElement('div');
        header.className = 'notification-header';

        // 3. Cria e Adiciona o Nome do App
        const appNameSpan = document.createElement('span');
        appNameSpan.className = 'app-name';
        appNameSpan.textContent = notification.app || 'Desconhecido';
        header.appendChild(appNameSpan);

        // 4. Cria e Adiciona o Timestamp
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = notification.timestamp || '';
        header.appendChild(timestampSpan);

        // 5. Cria e Adiciona o Botão Deletar ('X')
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;'; // Símbolo 'X'
        deleteBtn.title = 'Remover esta notificação';
        deleteBtn.dataset.id = notification.id; // Armazena o ID no botão para fácil acesso no evento
        // Adiciona o listener para chamar a função de exclusão ao clicar
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // Impede cliques acidentais em outros elementos
            const idToDelete = event.currentTarget.dataset.id; // Pega o ID do botão clicado
            // Pede confirmação antes de deletar
            if (idToDelete && confirm(`Tem certeza que deseja remover a notificação de "${notification.app || 'Desconhecido'}"?`)) {
                requestDeleteNotification(idToDelete);
            }
        });
        header.appendChild(deleteBtn); // Adiciona o botão ao cabeçalho

        // Adiciona o cabeçalho completo ao card
        card.appendChild(header);

        // 6. Adiciona a Keyword (se existir)
        if (notification.keyword) {
            const keywordContainer = document.createElement('div');
            keywordContainer.className = 'keyword-container'; // Classe para estilização opcional
            const keywordSpan = document.createElement('span');
            keywordSpan.className = 'keyword';
            keywordSpan.textContent = notification.keyword;
            keywordContainer.appendChild(keywordSpan);
            card.appendChild(keywordContainer);
        }

        // 7. Adiciona o Conteúdo (com links e quebras de linha)
        const contentDiv = document.createElement('div');
        contentDiv.className = 'notification-content';
        const rawContent = notification.content || 'Sem conteúdo';
        contentDiv.innerHTML = linkify(rawContent).replace(/\n/g, '<br>');
        card.appendChild(contentDiv);

        // 8. Adiciona o Card completo ao container na página
        container.appendChild(card);
    });
}
// --- FIM DA FUNÇÃO updateNotificationsList ---


// --- FUNÇÃO PARA ENVIAR REQUISIÇÃO DELETE ---
function requestDeleteNotification(notificationId) {
    console.log(`Tentando remover notificação com ID: ${notificationId}`);
    fetch(`/api/notification/${notificationId}`, {
        method: 'DELETE', // Especifica o método HTTP
    })
    .then(response => {
        // Verifica se a resposta do servidor foi OK (status 2xx)
        if (response.ok) {
            console.log(`Notificação ${notificationId} removida com sucesso (resposta do servidor).`);
            // Se deu certo, busca a lista atualizada do servidor para redesenhar a UI
            fetchNotifications();
        } else {
            // Se houve erro no servidor (4xx, 5xx), tenta mostrar a mensagem de erro
            response.json().then(data => {
                console.error(`Erro ao remover notificação ${notificationId}: ${response.status} - ${data.message || 'Erro desconhecido'}`);
                alert(`Erro ao remover notificação: ${data.message || response.statusText}`);
            }).catch(() => {
                // Fallback se a resposta não for JSON
                console.error(`Erro ao remover notificação ${notificationId}: ${response.status} - ${response.statusText}`);
                alert(`Erro ao remover notificação: ${response.statusText}`);
            });
        }
    })
    .catch(error => {
        // Trata erros de rede (ex: servidor offline)
        console.error('Erro de rede ao tentar remover notificação:', error);
        alert('Erro de rede ao tentar remover notificação.');
    });
}
// --- FIM DA FUNÇÃO requestDeleteNotification ---


// --- Funções restantes (Stats, Chart, Filter, Clear) ---

// Atualiza estatísticas
function updateStats() {
    document.getElementById('total-count').textContent = notifications.length;
    const apps = new Set(notifications.map(n => n.app).filter(Boolean));
    document.getElementById('app-count').textContent = apps.size;
    const keywords = new Set(notifications.map(n => n.keyword).filter(Boolean));
    document.getElementById('keyword-count').textContent = keywords.size;
}

// Inicializa o gráfico
function initChart() {
    const ctx = document.getElementById('notificationChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Notificações por App', data: [], backgroundColor: 'rgba(74, 109, 167, 0.7)', borderColor: 'rgba(74, 109, 167, 1)', borderWidth: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
}

// Atualiza o gráfico
function updateChart() {
    if (!chart) return;
    const appCounts = notifications.reduce((acc, notification) => {
        const app = notification.app || 'Desconhecido';
        acc[app] = (acc[app] || 0) + 1;
        return acc;
    }, {});
    chart.data.labels = Object.keys(appCounts);
    chart.data.datasets[0].data = Object.values(appCounts);
    chart.update();
}

// Atualiza o filtro de apps
function updateAppFilter() {
    const select = document.getElementById('app-filter');
    const currentValue = select.value;
    const currentOptions = new Set(Array.from(select.options).map(opt => opt.value));
    const apps = new Set(notifications.map(n => n.app).filter(Boolean));

    for (let i = select.options.length - 1; i >= 1; i--) {
        if (!apps.has(select.options[i].value)) {
            select.remove(i);
        }
    }
    apps.forEach(app => {
        if (!currentOptions.has(app)) {
            const option = document.createElement('option');
            option.value = app; option.textContent = app; select.appendChild(option);
        }
    });
    select.value = apps.has(currentValue) ? currentValue : "";
}

// Filtra notificações
function filterNotifications() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const appFilter = document.getElementById('app-filter').value;
    const filtered = notifications.filter(notification => {
        const appMatch = !appFilter || notification.app === appFilter;
        const searchMatch = !searchTerm ||
                            (notification.app || '').toLowerCase().includes(searchTerm) ||
                            (notification.content || '').toLowerCase().includes(searchTerm) ||
                            (notification.keyword || '').toLowerCase().includes(searchTerm);
        return appMatch && searchMatch;
    });
    updateNotificationsList(filtered);
}

// Limpa notificações
function clearNotifications() {
    if (confirm('Tem certeza que deseja limpar todas as notificações?')) {
        fetch('/clear', { method: 'POST' })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    fetchNotifications(); // Busca novamente para confirmar que está vazio
                } else {
                    alert('Erro ao limpar notificações: ' + (data.message || 'Erro desconhecido'));
                }
            })
            .catch(error => {
                console.error('Erro ao limpar notificações:', error);
                alert('Erro de rede ao tentar limpar notificações.');
            });
    }
}
