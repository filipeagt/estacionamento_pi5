from django.contrib import admin

from .models import *

from vagas.sensores import listaSensores

for sensor in listaSensores:
    admin.site.register(eval(f'Vaga{sensor}'))

