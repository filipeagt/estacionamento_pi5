from django.urls import path
from . import views

from vagas.sensores import listaSensores

urlpatterns = [
    path('', views.index, name='index'),
]

for sensor in listaSensores:
    urlpatterns += [
        path(f'vaga{sensor}.json', eval(f'views.vaga{sensor}_json'), name=f'vaga{sensor}_json')
    ]
