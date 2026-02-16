# estacionamento_pi5

Este site foi desenvolvido para a disciplina de projeto integrador V de Engenharia de Computação da Univesp.

## Configurando o ambiente Linux (Mint)

Execute os comando abaixo no terminal:

`sudo apt install python3-pip`

`sudo apt install virtualenvwrapper`
 
Adicionar as linhas abaixo no arquivo .bashrc no diretório home
    
    export WORKON_HOME=$HOME/.virtualenvs
    export VIRTUALENVWRAPPER_PYTHON=/usr/bin/python3
    export VIRTUALENVWRAPPER_VIRTUALENV_ARGS=' -p /usr/bin/python3 '
    export PROJECT_HOME=$HOME/Devel
    source /usr/share/virtualenvwrapper/virtualenvwrapper.sh
    
Outras distros podem ter caminho diferente para source, por exemplo caminho no Ubuntu:

/usr/local/bin/virtualenvwrapper.sh
    
Execute:

`source ~/.bashrc`
 
Criar o ambiente virtual:

`mkvirtualenv nome_ambiente`

## Configurando o ambiente Windows

Execute o comando abaixo no prompt de comandos:

`py -3 -m pip install virtualenvwrapper-win`

Criar o ambiente virtual:

`mkvirtualenv nome_ambiente`

## Rodar o projeto localmente (primeira vez) :

Abra a pasta do projeto no terminal e execute: 

    pip3 install -r requirements.txt
    python3 manage.py runserver

Abra o link <http://127.0.0.1:8000> no navegador.

Nas próximas vezes basta ativar o ambiente virtual configurado e rodar o projeto.

    workon nome_ambiente
    python3 manage.py runserver

## Usando o ambiente virtual

Comados úteis:

* `deactivate` - Sair do ambiente virtual Python atual
* `workon` - Listar os ambientes virtuais disponíveis
* `workon nome_ambiente` - Ativar o ambiente virtual Python especificado
* `rmvirtualenv name_of_environment` - Remover o ambiente especificado.
