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

// HiveMQ Cloud connection
const mqttOptions = {
  host: process.env.MQTT_HOST,
  port: parseInt(process.env.MQTT_PORT || '8883'),
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  protocol: 'mqtts'
};

// Get accurate time from multiple sources
async function getAccurateTime() {
  const timeSources = [
    {
      url: 'https://worldtimeapi.org/api/timezone/Asia/Colombo',
      parser: (data) => data.datetime
    },
    {
      url: 'https://timeapi.io/api/Time/current/zone?timeZone=Asia/Colombo',
      parser: (data) => data.currentDateTime
    },
    {
      url: 'https://www.timeapi.io/api/Time/current/ip',
      parser: (data) => data.dateTime
    }
  ];

  for (const source of timeSources) {
    try {
      const response = await fetch(source.url, { timeout: 3000 });
      if (response.ok) {
        const data = await response.json();
        const datetime = source.parser(data);

        // Parse datetime and day of week
        const date = new Date(datetime);
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const timeMatch = datetime.match(/(\d{2}):(\d{2}):(\d{2})/);

        if (timeMatch) {
          return {
            hour: parseInt(timeMatch[1]),
            minute: parseInt(timeMatch[2]),
            second: parseInt(timeMatch[3]),
            dayOfWeek: dayOfWeek,
            source: source.url,
            timestamp: date.toISOString()
          };
        }
      }
    } catch (error) {
      console.log(`Time source ${source.url} failed:`, error.message);
      continue;
    }
  }

  // Fallback to system time
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    hour: now.getUTCHours() + 5, // GMT+5:30
    minute: now.getUTCMinutes() + 30,
    second: now.getUTCSeconds(),
    dayOfWeek: days[now.getUTCDay()],
    source: 'system_fallback',
    timestamp: now.toISOString()
  };
}

exports.handler = async function (event, context) {
  console.log('🕐 CRON: Time sync function triggered');

  try {
    // Get accurate time
    const timeData = await getAccurateTime();
    console.log('Time obtained:', timeData);

    // Connect to MQTT
    const client = mqtt.connect(mqttOptions);

    await new Promise((resolve, reject) => {
      client.on('connect', () => {
        console.log('✅ Connected to MQTT for time sync');

        // Publish time to ESP32
        const timeMessage = JSON.stringify({
          type: 'time_sync',
          hour: timeData.hour,
          minute: timeData.minute,
          second: timeData.second,
          dayOfWeek: timeData.dayOfWeek,
          source: timeData.source,
          timestamp: timeData.timestamp
        });

        client.publish('bell/time/update', timeMessage, { qos: 1 }, (err) => {
          client.end();
          if (err) reject(err);
          else {
            console.log('✅ Time published to ESP32:', timeMessage);
            resolve();
          }
        });
      });

      client.on('error', reject);

      // Timeout
      setTimeout(() => {
        client.end();
        reject(new Error('MQTT connection timeout'));
      }, 5000);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Time ${timeData.hour}:${timeData.minute}:${timeData.second} sent to ESP32`,
        data: timeData
      })
    };

  } catch (error) {
    console.error('❌ CRON Time sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};