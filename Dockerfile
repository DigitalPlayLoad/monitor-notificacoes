# Use uma imagem base oficial do Python
FROM python:3.9-slim

# Define o diretório de trabalho no contêiner
WORKDIR /app

# Copia o arquivo de dependências
COPY requirements.txt requirements.txt

# Instala as dependências
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação e templates
COPY . .

# Expõe a porta que o Gunicorn vai usar (Cloud Run espera 8080 por padrão)
EXPOSE 8080

# Comando para rodar a aplicação usando Gunicorn
# Ajuste 'workers' conforme necessário (geralmente 2-4 por core)
# 'app:app' significa: no arquivo 'app.py', use a variável 'app' (Flask instance)
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "app:app"]
