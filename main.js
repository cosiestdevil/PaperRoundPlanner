import "./style.css";
import "mapbox-gl/dist/mapbox-gl.css";
import mapbox from "mapbox-gl";
import markerWithOrderSVG from "./marker-order.svg?raw";
import markerSVG from "./marker.svg?raw";
import { formatSI } from "si-format";
import { Duration } from "luxon";
export default () => {
  class Location {
    constructor(locationId) {
      this.id = locationId;
    }
    id;
    latitude;
    longitude;
    marker;
    address;
    toJSON() {
      return {
        id: this.id,
        latitude: this.latitude,
        longitude: this.longitude,
        address: this.address,
      };
    }
  }
  /**
   * @param {String} HTML representing a single element
   * @return {Element}
   */
  function htmlToElement(html) {
    var template = document.createElement("template");
    html = html.trim(); // Never return a text node of whitespace as the result
    template.innerHTML = html;
    return template.content.firstChild;
  }
  const getMarkerOptions = (order) => {
    const markerOptions = {};
    let markerAsString = markerSVG;
    let color = "#3fb1ce";
    if (order) markerAsString = markerWithOrderSVG.replace("{text}", order);
    if (location.id == "home" || order == 0) color = "#ff0000";
    markerOptions.element = htmlToElement(markerAsString);
    markerOptions.element.style.setProperty("--marker-color", color);
    return markerOptions;
  };
  const addMarker = (location) => {
    if (!location.marker) {
      location.marker = new mapbox.Marker(getMarkerOptions(location.id=="home"?0:false));
    }
    location.marker.setLngLat([location.longitude, location.latitude]);
    location.marker.addTo(map);
  };
  const applyBounds = () => {
    if (locations.size) {
      const bounds = new mapbox.LngLatBounds();
      [...locations.values()].forEach((m) =>
        bounds.extend(m.marker.getLngLat().toBounds(11))
      );
      const options = { padding: 30 };
      map.fitBounds(bounds, options);
    }
  };
  let routeMarkers = [];
  const planRoute = async () => {
    if (locations.size > 1) {
      const locs = [...locations.values()];
      locs.sort((a, b) =>
        a.id == "home" ? -1 : b.id == "home" ? 1 : a.id - b.id
      );
      const response = await fetch(
        `https://api.mapbox.com/optimized-trips/v1/mapbox/walking/${locs
          .map((l) => `${l.longitude},${l.latitude}`)
          .join(";")}?access_token=${accessToken}&geometries=geojson`
      );
      if (response.ok) {
        const result = await response.json();
        console.log(result);
        const trip = result.trips[0];
        [...locations.values()].forEach((l) => l.marker.remove());
        const totalDistance = trip.legs.reduce(
          (partialSum, l) => partialSum + l.distance,
          0
        );
        const totalDuration = trip.legs.reduce(
          (partialSum, l) => partialSum + l.duration,
          0
        );
        console.log(totalDistance);
        console.log(totalDuration);
        document.getElementById("distance").textContent = formatSI(
          totalDistance,
          { unit: "m" }
        );
        document.getElementById("duration").textContent = Duration.fromObject({
          seconds: totalDuration,
        })
          .rescale()
          .toFormat("hh:mm:ss");
        routeMarkers.forEach((m) => m.remove());
        routeMarkers = [];
        for (let waypoint of result.waypoints) {
          const marker = new mapbox.Marker(
            getMarkerOptions(waypoint.waypoint_index)
          );
          marker.setLngLat(waypoint.location);
          marker.addTo(map);
          routeMarkers.push(marker);
        }
        // const marker = new mapbox.Marker(getMarkerOptions());
        const source = map.getSource("trip");
        if (source) {
          if (source.type === "geojson") {
            source.setData(trip.geometry);
          }
        }
      }
    }
  };
  const accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const map = new mapbox.Map({
    accessToken: accessToken,
    style: "mapbox://styles/mapbox/streets-v12",
    container: document.getElementById("map"),
    useWebGL2: true,
  });
  map.on("style.load", () => {
    map.addSource("trip", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "tripLine",
      type: "line",
      source: "trip",
      layout: {},
      paint: {
        "line-color": "#FF0000",
        "line-width": 3,
      },
    });
  });
  const newLocationButton = document.getElementById("new-location");
  const locationList = document.getElementById("locations");
  const locationTemplate = document.getElementById("location-template");
  newLocationButton.addEventListener("click", () => {
    const newLocation = locationTemplate.content.cloneNode(true);
    newLocation.firstElementChild.dataset.locationId = crypto.randomUUID();
    locationList.appendChild(newLocation);
  });
  const locations = new Map(
    JSON.parse(localStorage.locations || "[]", (k, v) => {
      if (k == "1" && !Array.isArray(v)) {
        return Object.assign(new Location(v.id), v);
      }
      return v;
    })
  );
  for (let [_, loc] of locations) {
    if (loc.id == "home") {
      const addressElement = document.querySelector(
        `[data-location-id="${loc.id}"] textarea[name="address"]`
      );
      addressElement.value = loc.address;
    } else {
      const newLocation = locationTemplate.content.cloneNode(true);
      const addressElement = newLocation.querySelector(
        'textarea[name="address"]'
      );
      addressElement.value = loc.address;
      locationList.appendChild(newLocation);
    }
    addMarker(loc);
  }
  applyBounds();
  planRoute();
  document.addEventListener("change", async (event) => {
    const listItem = event.target.closest("li");
    if (!listItem) {
      return;
    }
    const locationId = listItem.dataset.locationId;
    if (!locationId) {
      return;
    }
    let location = locations.get(locationId) || new Location(locationId);
    const fieldName = event.target.name;
    location[fieldName] = event.target.value;
    locations.set(locationId, location);
    if (fieldName === "address") {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${location[fieldName]}.json?access_token=${accessToken}`
      );
      if (response.ok) {
        const result = await response.json();
        const loc = result.features[0].center;
        [location.longitude, location.latitude] = loc;
        addMarker(location);
        applyBounds();
        planRoute();
      }
    }
    localStorage.locations = JSON.stringify([...locations]);
  });
};
