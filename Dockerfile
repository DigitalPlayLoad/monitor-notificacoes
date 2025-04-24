# Dockerfile para a aplicação monitor-notificacoes no App Engine Flex

# 1. Escolha uma imagem base oficial do Python
# Use a mesma versão (ou uma compatível) que você testou localmente
# As imagens 'slim' são menores e geralmente suficientes
FROM python:3.10-slim

# 2. Defina variáveis de ambiente (opcional, mas útil)
# Garante que o output do Python não seja bufferizado (bom para logs)
ENV PYTHONUNBUFFERED=1
# Define a porta padrão que o Gunicorn vai usar se $PORT não for definido
# App Engine Flex fornecerá a variável $PORT, mas é bom ter um padrão.
ENV PORT=8080

# 3. Crie e defina o diretório de trabalho dentro do container
WORKDIR /app

# 4. Copie APENAS o arquivo de dependências primeiro
# Isso aproveita o cache do Docker: se requirements.txt não mudar,
# a instalação não será refeita em builds futuros.
COPY requirements.txt ./

# 5. Instale as dependências
# Atualiza o pip e instala os pacotes listados em requirements.txt
# --no-cache-dir ajuda a manter a imagem menor
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 6. Copie o restante do código da aplicação para o diretório de trabalho
# Certifique-se de ter um .dockerignore para não copiar arquivos desnecessários
COPY . .

# 7. Exponha a porta que o Gunicorn estará escutando dentro do container
# O App Engine Flex mapeará o tráfego externo para esta porta ($PORT)
EXPOSE ${PORT}

# 8. Defina o comando para rodar a aplicação quando o container iniciar
# Usa Gunicorn para servir a aplicação Flask (app:app -> objeto 'app' no arquivo 'app.py')
# Escuta em todas as interfaces (0.0.0.0) na porta definida pela variável $PORT
CMD ["gunicorn", "--bind", "0.0.0.0:${PORT}", "app:app"]
