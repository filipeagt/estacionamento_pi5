# Os sensores listados na variável abaixo são incluídos automaticamente no projeto.
# Gerando models, urls, views para json e tópicos personalizados para inscrição no broker MQTT. 
# Podem ser incluídos explicitamente Ex: listaSensores = ['A01', 'A02', ...] ou  por laço de repetição.
# Depois de alterar é necessário usar os comandos makemigrations e migrate para atualizar o banco de dados
listaSensores = []
for x in range(1,41):
    listaSensores.append(f'A{str(x).zfill(2)}') # A01 até A40
