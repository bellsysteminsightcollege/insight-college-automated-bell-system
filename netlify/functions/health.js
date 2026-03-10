// ===============================================================
// Automated School Bell System
// Copyright (c) 2026 Aaqib's DevDesk. All Rights Reserved.
// Developer: Aaqib Anwar @ Aaqib's DevDesk

// Project: Automated School Bell System
// Developed for: Institutional Bell Schedule Automation
// Developer Contact: aaqib.devdesk@gmail.com , anwarcareem@gmail.com

// ---------------------------------------------------------------
// INTELLECTUAL PROPERTY NOTICE
// ---------------------------------------------------------------

// This software, including its source code, architecture, design,
// documentation, and associated systems, is the intellectual
// property of Aaqib Anwar @ Aaqib's DevDesk.

// This project was independently designed and developed by
// Aaqib Anwar @ Aaqib's DevDesk and is protected under applicable copyright laws
// and international intellectual property regulations.

// ---------------------------------------------------------------
// RESTRICTIONS
// ---------------------------------------------------------------

// The following actions are STRICTLY PROHIBITED without explicit
// written permission from the developer:

// • Copying or reproducing this software
// • Modifying the source code
// • Redistributing the code
// • Reverse engineering or extracting logic
// • Using the system for commercial or institutional deployment
// • Reusing any part of the codebase in other projects

// Unauthorized use, duplication, or distribution of this software
// or any portion of it may result in legal action.

// ---------------------------------------------------------------
// PERMITTED USE
// ---------------------------------------------------------------

// The deployed system may only be used for operational purposes
// within the institution for which it was developed.

// The source code remains the property of the developer.

// ---------------------------------------------------------------
// DISCLAIMER
// ---------------------------------------------------------------

// This software is provided "as is" without warranties of any kind.
// The developer shall not be held liable for damages arising from
// misuse, modification, or unauthorized deployment.

// ---------------------------------------------------------------
// END OF NOTICE
// ---------------------------------------------------------------

const mqtt = require('mqtt');

exports.handler = async function(event, context) {
  console.log('🏥 Health check invoked');
  
  const mqttOptions = {
    host: process.env.MQTT_HOST,
    port: parseInt(process.env.MQTT_PORT || '8883'),
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocol: 'mqtts',
    rejectUnauthorized: false,
    connectTimeout: 5000
  };
  
  let mqttClient = null;
  
  try {
    mqttClient = mqtt.connect(mqttOptions);
    
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (mqttClient) mqttClient.end();
        reject(new Error('Connection timeout'));
      }, 5000);
      
      mqttClient.on('connect', () => {
        clearTimeout(timeout);
        mqttClient.end();
        resolve({
          status: 'healthy',
          mqtt: 'connected',
          timestamp: new Date().toISOString()
        });
      });
      
      mqttClient.on('error', (err) => {
        clearTimeout(timeout);
        mqttClient.end();
        reject(err);
      });
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'unhealthy',
        mqtt: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};