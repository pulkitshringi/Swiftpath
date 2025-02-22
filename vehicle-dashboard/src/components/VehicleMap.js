import React, { useState, useEffect } from "react";
import { GoogleMap, LoadScript, DirectionsRenderer, Marker } from "@react-google-maps/api";
import "bootstrap/dist/css/bootstrap.min.css";

const containerStyle = { width: "100%", height: "100vh" };
const center = { lat: 13.0827, lng: 80.2707 }; // Default Chennai center
const ws = new WebSocket("ws://localhost:8080"); // WebSocket connection

const VehicleMap = () => {
  const [directions, setDirections] = useState(null);
  const [ambulancePosition, setAmbulancePosition] = useState({ lat: 13.0827, lng: 80.2707 });
  const [patientLocation, setPatientLocation] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [emergencyData, setEmergencyData] = useState(null);
  const [eta, setEta] = useState(null);
  const [trafficLights, setTrafficLights] = useState(0);
  const [requestPending, setRequestPending] = useState(false);
  const [requestAccepted, setRequestAccepted] = useState(false);

  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // Listen for incoming WebSocket messages (patient requests)
  useEffect(() => {
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("New patient request received:", data);

      setEmergencyData(data);
      setPatientLocation({ lat: data.latitude, lng: data.longitude });
      setRequestPending(true); // Show request panel
    };
  }, []);

  // Fetch ETA, Traffic Lights, and Move Ambulance when request is accepted
  useEffect(() => {
    if (!patientLocation || !mapLoaded || !requestAccepted) return;

    const fetchRoute = async () => {
      if (!window.google || !window.google.maps) {
        console.error("Google Maps API not loaded yet.");
        return;
      }

      const directionsService = new window.google.maps.DirectionsService();

      directionsService.route(
        {
          origin: ambulancePosition,
          destination: patientLocation,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirections(result);

            // ✅ Get Estimated Time (ETA)
            const leg = result.routes[0].legs[0];
            setEta(leg.duration.text);

            // ✅ Detect Traffic Lights
            const steps = leg.steps;
            let trafficLightCount = 0;
            steps.forEach((step) => {
              if (step.maneuver && step.maneuver.toLowerCase().includes("turn")) {
                trafficLightCount++;
              }
            });
            setTrafficLights(trafficLightCount);

            // ✅ Move Ambulance Smoothly
            const routePath = leg.steps.flatMap((step) => [
              { lat: step.start_location.lat(), lng: step.start_location.lng() },
              { lat: step.end_location.lat(), lng: step.end_location.lng() },
            ]);

            moveAmbulanceSmoothly(routePath);
          } else {
            console.error("Error fetching directions:", status);
          }
        }
      );
    };

    fetchRoute();
  }, [patientLocation, mapLoaded, requestAccepted]);

  // ✅ Function to Move Ambulance Smoothly
  const moveAmbulanceSmoothly = (routePath) => {
    let index = 0;
  
    const moveStep = () => {
      if (index < routePath.length - 1) {
        const start = routePath[index];
        const end = routePath[index + 1];
  
        let step = 0;
        const totalSteps = 200;
  
        const interval = setInterval(() => {
          if (step < totalSteps) {
            const lat = start.lat + ((end.lat - start.lat) * step) / totalSteps;
            const lng = start.lng + ((end.lng - start.lng) * step) / totalSteps;
            setAmbulancePosition({ lat, lng });
            step++;
          } else {
            clearInterval(interval);
            index++;
            moveStep();
          }
        }, 100);
      }
    };
  
    moveStep();
  };

  // ✅ Accept Request
  const handleAcceptRequest = async () => {
    setRequestPending(false);
    setRequestAccepted(true);

    if (emergencyData?.name) {
        try {
            await fetch("http://localhost:8080/accept-request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ patientName: emergencyData.name }),
            });

            console.log("✅ Request accepted & SMS triggered!");
        } catch (error) {
            console.error("❌ Error sending request:", error);
        }
    }
};

  // ✅ Reject Request
  const handleRejectRequest = () => {
    setRequestPending(false);
    setEmergencyData(null);
    setPatientLocation(null);
  };

  return (
    <LoadScript googleMapsApiKey={apiKey} onLoad={() => setMapLoaded(true)}>
      <div className="container-fluid">
        <div className="row">
          {/* Left Panel - Accept/Reject Request */}
          <div className="col-md-3 bg-light p-3">
            {requestPending ? (
              <div className="card">
                <div className="card-header bg-danger text-white">🚨 Emergency Request</div>
                <div className="card-body">
                  <p><strong>Patient:</strong> {emergencyData?.name}</p>
                  <p><strong>Phone:</strong> {emergencyData?.phone}</p>
                  <p><strong>Location:</strong> {patientLocation?.lat}, {patientLocation?.lng}</p>
                  <button className="btn btn-success w-100 mb-2" onClick={handleAcceptRequest}>✅ Accept</button>
                  <button className="btn btn-danger w-100" onClick={handleRejectRequest}>❌ Reject</button>
                </div>
              </div>
            ) : requestAccepted ? (
              <div className="card">
                <div className="card-header bg-primary text-white">🚑 Ambulance on the Way</div>
                <div className="card-body">
                  <p><strong>ETA:</strong> {eta ? eta : "Calculating..."}</p>
                  <p><strong>Traffic Lights on Route:</strong> {trafficLights} 🚦</p>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-header bg-secondary text-white">⏳ Waiting for Request</div>
                <div className="card-body">
                  <p>No emergency request received yet.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Map */}
          <div className="col-md-9">
            {mapLoaded ? (
              <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={12}>
                {directions && <DirectionsRenderer directions={directions} />}

                {/* 🚑 Moving Ambulance Marker */}
                {ambulancePosition && (
                  <Marker
                    position={ambulancePosition}
                    icon={{
                      url: "https://cdn-icons-png.freepik.com/512/2894/2894975.png",
                      scaledSize: new window.google.maps.Size(50, 50),
                    }}
                  />
                )}

                {/* 🏥 Patient Location Marker */}
                {patientLocation && (
                  <Marker
                    position={patientLocation}
                    icon={{
                      url: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
                      scaledSize: new window.google.maps.Size(40, 40),
                    }}
                  />
                )}
              </GoogleMap>
            ) : (
              <p>Loading Google Maps...</p>
            )}
          </div>
        </div>
      </div>
    </LoadScript>
  );
};

export default VehicleMap;