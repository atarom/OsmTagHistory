<div align="center">
  <img src="assets/logo.png" alt="Logo de OSM Tag History" width="460">
  <h1>OSM Tag History</h1>
  <p>Explora y compara la evolución histórica de etiquetas de OpenStreetMap.</p>
  <p><a href="https://atarom.github.io/OsmTagHistory/">Abrir aplicación</a></p>
</div>

---

OSM Tag History representa la evolución de etiquetas `key` y `key=value` mediante gráficos interactivos. Permite comparar varias etiquetas, seleccionar ámbitos geográficos, acercar el gráfico, exportar los datos a CSV y abrir consultas históricas en Overpass Turbo.

## Tecnologías y datos

[Chart.js](https://www.chartjs.org/) y [chartjs-plugin-zoom](https://www.chartjs.org/chartjs-plugin-zoom/latest/) para visualizar los datos históricos de [Taginfo](https://taginfo.openstreetmap.org/) y sus instancias regionales de [Geofabrik](https://taginfo.geofabrik.de/). Las consultas detalladas se abren en [Overpass Turbo](https://overpass-turbo.eu/).
