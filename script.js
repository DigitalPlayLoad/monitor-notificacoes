// Variáveis globais para armazenar o estado da aplicação
let notifications = []; // Array para guardar as notificações recebidas do servidor
let chart = null;       // Objeto do gráfico Chart.js

// --- INICIALIZAÇÃO ---
// Função executada quando o conteúdo HTML da página foi completamente carregado
document.addEventListener('DOMContentLoaded', function() {
    // Busca as notificações iniciais ao carregar a página
    fetchNotifications();
    // Configura a busca automática de novas notificações a cada 10 segundos
    setInterval(fetchNotifications, 10000); // 10000 ms = 10 segundos

    // Adiciona listeners aos botões e inputs de filtro/ação
    document.getElementById('search-btn').addEventListener('click', filterNotifications);
    document.getElementById('search-input').addEventListener('keyup', function(event) {
        // Permite filtrar pressionando Enter no campo de busca
        if (event.key === 'Enter') filterNotifications();
    });
    document.getElementById('clear-btn').addEventListener('click', clearNotifications);
    document.getElementById('app-filter').addEventListener('change', filterNotifications); // Filtra ao mudar app no dropdown

    // Inicializa o gráfico de estatísticas
    initChart();
});

// --- FUNÇÕES DE DADOS E API ---

// Busca notificações do endpoint /notifications no servidor
function fetchNotifications() {
    fetch('/notifications')
        .then(response => {
            if (!response.ok) { // Verifica se a resposta da API foi bem-sucedida
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            return response.json(); // Converte a resposta para JSON
        })
        .then(data => {
            // Otimização: Compara IDs para verificar se houve mudança real nos dados
            // Evita redesenhar a UI desnecessariamente se os dados forem os mesmos.
            const currentIds = notifications.map(n => n.id).sort().join(',');
            const newIds = data.map(n => n.id).sort().join(',');

            // Atualiza a UI apenas se os IDs ou a quantidade mudaram
            if (currentIds !== newIds || notifications.length !== data.length) {
                console.log("Dados de notificação alterados, atualizando UI.");
                notifications = data; // Atualiza a variável global com os novos dados
                // Chama as funções para atualizar as diferentes partes da interface
                updateNotificationsList();
                updateStats();
                updateChart();
                updateAppFilter();
            }
        })
        .catch(error => console.error('Erro ao buscar notificações:', error)); // Loga erros no console
}

// Envia uma requisição DELETE para remover uma notificação específica pelo ID
function requestDeleteNotification(notificationId) {
    console.log(`Tentando remover notificação com ID: ${notificationId}`);
    // Pede confirmação ao usuário antes de prosseguir com a exclusão
    if (!confirm(`Tem certeza que deseja remover esta notificação?`)) {
        console.log("Remoção cancelada pelo usuário.");
        return; // Interrompe a função se o usuário cancelar
    }

    fetch(`/api/notification/${notificationId}`, { // Usa o endpoint da API para delete
        method: 'DELETE', // Especifica o método HTTP DELETE
    })
    .then(response => {
        // Verifica se a resposta do servidor foi OK (status 2xx)
        if (response.ok) {
            console.log(`Notificação ${notificationId} removida com sucesso (resposta do servidor).`);
            // Se deu certo, busca a lista atualizada do servidor para redesenhar a UI
            // Isso garante que a UI reflita o estado atual do servidor.
            fetchNotifications();
        } else {
            // Se houve erro no servidor (4xx, 5xx), tenta mostrar a mensagem de erro
            response.json().then(data => {
                const errorMessage = `Erro ao remover notificação: ${data.message || response.statusText}`;
                console.error(`Erro ao remover notificação ${notificationId}: ${response.status} - ${errorMessage}`);
                alert(errorMessage); // Informa o usuário sobre o erro
            }).catch(() => {
                // Fallback se a resposta de erro não for JSON
                const errorText = `Erro ao remover notificação: ${response.statusText} (Status: ${response.status})`;
                console.error(`Erro ao remover notificação ${notificationId}: ${errorText}`);
                alert(errorText);
            });
        }
    })
    .catch(error => {
        // Trata erros de rede (ex: servidor offline, problema de conexão)
        console.error('Erro de rede ao tentar remover notificação:', error);
        alert('Erro de rede ao tentar remover notificação.');
    });
}

// Envia uma requisição POST para limpar todas as notificações
function clearNotifications() {
    // Pede confirmação dupla, pois é uma ação destrutiva
    if (confirm('Tem certeza que deseja limpar TODAS as notificações? Esta ação não pode ser desfeita.')) {
        fetch('/clear', { method: 'POST' }) // Endpoint para limpar tudo
            .then(response => {
                 if (!response.ok) { throw new Error(`Erro HTTP: ${response.status}`); }
                 return response.json();
            })
            .then(data => {
                if (data.status === 'success') {
                    console.log("Todas as notificações removidas com sucesso.");
                    fetchNotifications(); // Busca novamente para confirmar que está vazio e atualizar a UI
                } else {
                    const errorMessage = 'Erro ao limpar notificações: ' + (data.message || 'Erro desconhecido');
                    console.error(errorMessage);
                    alert(errorMessage);
                }
            })
            .catch(error => {
                console.error('Erro ao limpar notificações:', error);
                alert('Erro de rede ao tentar limpar notificações.');
            });
    } else {
        console.log("Limpeza de notificações cancelada pelo usuário.");
    }
}


// --- FUNÇÕES DE ATUALIZAÇÃO DA UI ---

// Atualiza a lista de cartões de notificação na página
function updateNotificationsList(filteredData = null) {
    const container = document.getElementById('notifications-container');
    // Usa os dados filtrados se fornecidos, caso contrário, usa a lista global completa
    const dataToShow = filteredData !== null ? filteredData : notifications;
    container.innerHTML = ''; // Limpa eficientemente o conteúdo atual do container

    // Mostra uma mensagem se não houver notificações para exibir
    if (dataToShow.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhuma notificação encontrada.</p>';
        return;
    }

    // Itera sobre cada notificação para criar seu cartão correspondente
    dataToShow.forEach(notification => {
        // Validação: Pula a notificação se ela não tiver um ID (essencial para exclusão)
        if (!notification.id) {
            console.warn("Notificação sem ID encontrada, pulando:", notification);
            return; // Próxima iteração
        }

        // Criação dinâmica dos elementos HTML para o cartão de notificação
        const card = document.createElement('div');
        card.className = 'notification-card';
        card.dataset.notificationId = notification.id; // Guarda o ID no elemento para referência

        const header = document.createElement('div');
        header.className = 'notification-header';

        const appNameSpan = document.createElement('span');
        appNameSpan.className = 'app-name';
        appNameSpan.textContent = notification.app || 'Desconhecido'; // Nome do App
        header.appendChild(appNameSpan);

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = notification.timestamp || ''; // Data/Hora
        header.appendChild(timestampSpan);

        // Botão Deletar ('X')
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;'; // Símbolo 'X' (HTML entity)
        deleteBtn.title = 'Remover esta notificação'; // Tooltip
        deleteBtn.dataset.id = notification.id; // Armazena o ID no botão para fácil acesso no evento
        // Adiciona o listener para chamar a função de exclusão ao clicar
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // Impede que o clique se propague para o card pai
            const idToDelete = event.currentTarget.dataset.id; // Pega o ID do botão clicado
            if (idToDelete) {
                requestDeleteNotification(idToDelete); // Chama a função de exclusão
            } else {
                console.error("ID não encontrado no botão de deletar.");
            }
        });
        header.appendChild(deleteBtn); // Adiciona o botão ao cabeçalho

        card.appendChild(header); // Adiciona o cabeçalho ao card

        // Keyword (se existir)
        if (notification.keyword) {
            const keywordContainer = document.createElement('div');
            keywordContainer.className = 'keyword-container';
            const keywordSpan = document.createElement('span');
            keywordSpan.className = 'keyword';
            keywordSpan.textContent = notification.keyword;
            keywordContainer.appendChild(keywordSpan);
            card.appendChild(keywordContainer);
        }

        // Conteúdo da Notificação (com links e quebras de linha)
        const contentDiv = document.createElement('div');
        contentDiv.className = 'notification-content';
        const rawContent = notification.content || 'Sem conteúdo';
        // Usa linkify para criar links e substitui \n por <br> para exibir quebras de linha
        contentDiv.innerHTML = linkify(rawContent).replace(/\n/g, '<br>');
        card.appendChild(contentDiv);

        // Adiciona o Card completo ao container na página
        container.appendChild(card);
    });
}

// Atualiza os contadores de estatísticas (Total, Apps Únicos, Keywords Únicas)
function updateStats() {
    document.getElementById('total-count').textContent = notifications.length;
    // Usa Set para contar valores únicos facilmente
    const apps = new Set(notifications.map(n => n.app).filter(Boolean)); // filter(Boolean) remove nulos/vazios
    document.getElementById('app-count').textContent = apps.size;
    const keywords = new Set(notifications.map(n => n.keyword).filter(Boolean));
    document.getElementById('keyword-count').textContent = keywords.size;
}

// Inicializa o gráfico usando Chart.js
function initChart() {
    const ctx = document.getElementById('notificationChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'bar', // Tipo de gráfico
        data: {
            labels: [], // Rótulos (nomes dos apps) - inicializados vazios
            datasets: [{
                label: 'Notificações por App', // Legenda do dataset
                data: [], // Dados (contagens) - inicializados vazios
                backgroundColor: 'rgba(74, 109, 167, 0.7)', // Cor das barras
                borderColor: 'rgba(74, 109, 167, 1)', // Cor da borda das barras
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, // Torna o gráfico responsivo ao tamanho do container
            maintainAspectRatio: false, // Permite que o gráfico não mantenha a proporção original
            scales: {
                y: { // Configurações do eixo Y
                    beginAtZero: true, // Começa o eixo Y no zero
                    ticks: {
                        precision: 0 // Garante que os ticks (marcas) do eixo Y sejam números inteiros
                    }
                }
            }
        }
    });
}

// Atualiza os dados do gráfico com base nas notificações atuais
function updateChart() {
    if (!chart) return; // Não faz nada se o gráfico não foi inicializado

    // Conta quantas notificações existem para cada app
    const appCounts = notifications.reduce((acc, notification) => {
        const app = notification.app || 'Desconhecido'; // Agrupa apps sem nome como 'Desconhecido'
        acc[app] = (acc[app] || 0) + 1; // Incrementa a contagem para o app
        return acc;
    }, {}); // Começa com um objeto vazio

    // Atualiza os dados do gráfico Chart.js
    chart.data.labels = Object.keys(appCounts); // Define os rótulos como os nomes dos apps
    chart.data.datasets[0].data = Object.values(appCounts); // Define os dados como as contagens
    chart.update(); // Redesenha o gráfico com os novos dados
}

// Atualiza as opções do dropdown de filtro de aplicativos
function updateAppFilter() {
    const select = document.getElementById('app-filter');
    const currentValue = select.value; // Guarda o valor atualmente selecionado para tentar restaurá-lo
    // Cria um Set com as opções atuais para verificação rápida
    const currentOptions = new Set(Array.from(select.options).map(opt => opt.value));
    // Cria um Set com todos os nomes de apps únicos das notificações atuais
    const apps = new Set(notifications.map(n => n.app).filter(Boolean));

    // Remove opções do select que não correspondem mais a nenhum app existente
    // Itera de trás para frente para evitar problemas ao remover itens durante a iteração
    for (let i = select.options.length - 1; i >= 1; i--) { // Começa em 1 para não remover "Todos os Apps"
        if (!apps.has(select.options[i].value)) {
            select.remove(i);
        }
    }

    // Adiciona novas opções para apps que apareceram nas notificações mas não estão no select
    apps.forEach(app => {
        if (!currentOptions.has(app)) { // Adiciona apenas se a opção não existir
            const option = document.createElement('option');
            option.value = app;
            option.textContent = app;
            select.appendChild(option);
        }
    });

    // Tenta restaurar o valor selecionado anteriormente, se ele ainda existir
    select.value = apps.has(currentValue) ? currentValue : ""; // Se não existir mais, seleciona "Todos os Apps"
}


// --- FUNÇÕES DE INTERAÇÃO DO USUÁRIO ---

// Filtra a lista de notificações com base no termo de busca e no app selecionado
function filterNotifications() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase(); // Termo de busca em minúsculas
    const appFilter = document.getElementById('app-filter').value; // App selecionado no dropdown

    // Filtra o array global 'notifications'
    const filtered = notifications.filter(notification => {
        // Verifica se o app corresponde (ou se nenhum app está selecionado)
        const appMatch = !appFilter || notification.app === appFilter;
        // Verifica se o termo de busca corresponde a algum campo (app, content, keyword)
        // Usa || '' para evitar erros se algum campo for null/undefined
        const searchMatch = !searchTerm ||
                            (notification.app || '').toLowerCase().includes(searchTerm) ||
                            (notification.content || '').toLowerCase().includes(searchTerm) ||
                            (notification.keyword || '').toLowerCase().includes(searchTerm);
        // A notificação passa no filtro se ambos os critérios (app e busca) forem atendidos
        return appMatch && searchMatch;
    });

    // Atualiza a lista na UI para mostrar apenas as notificações filtradas
    updateNotificationsList(filtered);
}

// --- FUNÇÕES UTILITÁRIAS ---

// Converte URLs em texto simples para links HTML clicáveis
function linkify(inputText) {
    if (!inputText) return ''; // Retorna string vazia se a entrada for nula ou vazia

    // Regex para encontrar URLs (http, https, ftp, file) e domínios começando com www.
    // g = global (encontrar todas as ocorrências), i = case-insensitive
    const urlPattern = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])|(\bwww\.[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;

    // Função para substituir a URL encontrada pelo link HTML
    const replacer = (url) => {
        let href = url;
        // Adiciona http:// para URLs que começam com www. para garantir que funcionem
        if (url.startsWith('www.')) {
            href = 'http://' + url;
        }
        // Cria a tag <a> com target="_blank" para abrir em nova aba
        return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    };

    // Aplica a substituição no texto de entrada
    return inputText.replace(urlPattern, replacer);
}
