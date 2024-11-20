import React from "react";
import ReactDOM from "react-dom";
import * as tf from '@tensorflow/tfjs';
import {loadGraphModel} from '@tensorflow/tfjs-converter';
import "./styles.css";
tf.setBackend('webgl');

const threshold = 0.60;

async function load_model() {
    // Load the model with the correct configuration
    const model = await tf.loadGraphModel('https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1', {
        fromTFHub: true
    });
    return model;
}

let classesDir = {
    77: {  // COCO-SSD class ID for cell phone
        name: 'Mobile Phone',
        id: 77,
    },
    // Add other classes if needed
}

class App extends React.Component {
  videoRef = React.createRef();
  canvasRef = React.createRef();

  state = {
    detectionTimes: [],
    averageDetectionTime: 0
  }

  async logToVercel(data) {
    try {
      const enhancedData = {
        ...data,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        backend: tf.getBackend(),
        screenSize: `${window.innerWidth}x${window.innerHeight}`
      };

      const response = await fetch('/api/log-detection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enhancedData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to log to Vercel:', error);
    }
  }

  updateDetectionStats(processingTime) {
    const times = [...this.state.detectionTimes, processingTime].slice(-30);
    const average = times.reduce((a, b) => a + b, 0) / times.length;
    
    this.setState({
      detectionTimes: times,
      averageDetectionTime: average
    });
    
    if (times.length % 30 === 0) {
      this.logToVercel({
        detectionTime: average,
        type: 'average_detection_time'
      });
    }
  }

  componentDidMount() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const webCamPromise = navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: {
            facingMode: "environment"
          }
        })
        .then(stream => {
          window.stream = stream;
          this.videoRef.current.srcObject = stream;
          return new Promise((resolve, reject) => {
            this.videoRef.current.onloadedmetadata = () => {
              resolve();
            };
          });
        });

      const modelPromise = load_model();

      Promise.all([modelPromise, webCamPromise])
        .then(values => {
          this.detectFrame(this.videoRef.current, values[0]);
        })
        .catch(error => {
          console.error(error);
        });
    }
  }

    detectFrame = (video, model) => {
        const startTime = performance.now();
        tf.engine().startScope();
        
        const input = this.process_input(video);
        
        // Changed input_tensor to image_tensor
        model.executeAsync({
            'image_tensor': input.expandDims(0)
        }).then(predictions => {
            const endTime = performance.now();
            const processingTime = endTime - startTime;
            this.updateDetectionStats(processingTime);
            
            this.renderPredictions(predictions);
            requestAnimationFrame(() => {
                this.detectFrame(video, model);
            });
            
            // Clean up tensors
            input.dispose();
            predictions.forEach(tensor => tensor.dispose());
            tf.engine().endScope();
        }).catch(error => {
            console.error('Detection error:', error);
            // Retry detection on error
            requestAnimationFrame(() => {
                this.detectFrame(video, model);
            });
        });
    };

  process_input(video_frame) {
    // Process input according to the model's requirements
    const tfimg = tf.browser.fromPixels(video_frame);
    // The model expects uint8 input
    return tfimg;
  }

  buildDetectedObjects(predictions) {
    const detectionObjects = [];
    let phoneCount = 0;
    let highestConfidence = 0;

    // Get relevant tensors
    const scores = predictions[5].arraySync()[0];
    const boxes = predictions[4].arraySync()[0];
    const classes = predictions[6].dataSync();

    scores.forEach((score, i) => {
      // Class 77 is 'cell phone' in COCO dataset
      if (score > threshold && classes[i] === 77) {
        const bbox = [
          boxes[i][1] * this.videoRef.current.width,  // x
          boxes[i][0] * this.videoRef.current.height, // y
          boxes[i][3] * this.videoRef.current.width,  // width
          boxes[i][2] * this.videoRef.current.height  // height
        ];
        
        phoneCount++;
        highestConfidence = Math.max(highestConfidence, score);
        
        detectionObjects.push({
          label: 'Mobile Phone',
          score: score,
          bbox: bbox
        });
      }
    });
    
    if (phoneCount > 0) {
      this.logToVercel({
        phoneCount,
        confidence: highestConfidence * 100,
        type: 'phone_detection',
        detectionTime: this.state.averageDetectionTime
      });
    }
    
    return detectionObjects;
  }

  renderPredictions = predictions => {
    const ctx = this.canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Get video frame
    const video = this.videoRef.current;
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);

    // Font options
    const font = "16px helvetica";
    ctx.font = font;
    ctx.textBaseline = "top";

    const detections = this.buildDetectedObjects(predictions);

    detections.forEach(item => {
      const [x, y, width, height] = item.bbox;

      // Draw the highlighter box
      ctx.strokeStyle = "#00BFFF";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width - x, height - y);

      // Draw the label background
      ctx.fillStyle = "rgba(0, 191, 255, 0.85)";
      const textWidth = ctx.measureText(item.label + " " + (100 * item.score).toFixed(2) + "%").width;
      const textHeight = parseInt(font, 10);
      ctx.fillRect(x, y - textHeight - 4, textWidth + 8, textHeight + 4);

      // Draw the text
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(
        item.label + " " + (100 * item.score).toFixed(2) + "%",
        x + 4,
        y - textHeight
      );
    });
  };

  render() {
    const { averageDetectionTime } = this.state;
    
    return (
      <div className="container">
        <h1>Real-Time Object Detection: Mobile Phones</h1>
        <h2>MobileNetV2 SSD</h2>
        
        {averageDetectionTime > 0 && (
          <div className="stats">
            <p>Average Detection Time: {averageDetectionTime.toFixed(2)} ms</p>
            <p>Backend: {tf.getBackend()}</p>
          </div>
        )}
        
        <div className="videoView">
          <video
            className="size"
            autoPlay
            playsInline
            muted
            ref={this.videoRef}
            width="600"
            height="500"
            id="frame"
          />
          <canvas
            className="size"
            ref={this.canvasRef}
            width="600"
            height="500"
          />
        </div>
      </div>
    );
  }
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
