const AWS = require('aws-sdk');

AWS.config.update({
  region: 'us-east-1'
});

const docClient = new AWS.DynamoDB.DocumentClient();
const docTable = 'teeth';

const kids = ['jane', 'margaret'];

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
  return {
    outputSpeech: {
      type: 'PlainText',
      text: output,
    },
    card: {
      type: 'Simple',
      title: title,
      content: output,
    },
    reprompt: {
      outputSpeech: {
        type: 'PlainText',
        text: repromptText,
      },
    },
    shouldEndSession,
  };
}

function buildResponse(speechletResponse) {
  const sessionAttributes = {};
  return {
    version: '1.0',
    sessionAttributes,
    response: speechletResponse,
  };
}

/**
 * on launch request
 */
function getWelcomeResponse(cb) {
  const speechOutput = `Hi welcome to teeth brushing!  You can say things like, ${kids[0]} brushed her teeth.  Or, did ${kids[1]} brush her teeth today?`;
  const repromptText = 'You have beautiful teeth!  I am so happy that you are so good about brushing them!';
  return cb(null, buildSpeechletResponse('Hello', speechOutput, repromptText, false));
}

/**
 * on AMAZON.HelpIntent
 */
function getHelpResponse(cb) {
  const speechOutput = `This is a special app for smallchies and chunks only.  It remembers when you tell it that you brushed your teeth.  And it can tell you when you last brushed them.  You can say things like, ${kids[1]} brushed her teeth.  Or, when did ${kids[0]} last brush her teeth?`
  const repromptText = 'You have the most beautiful teeth!';
  cb(null, buildSpeechletResponse('Help', speechOutput, repromptText, false));
}

/**
 * on AMAZON.FallbackIntent
 */
function getFallbackResponse(cb) {
  const speechOutput = 'I did not understand that!  Try telling me who brushed her teeth.  Or ask for help by saying help.';
  const repromptText = 'I love talking about your very nice teeth!';
  cb(null, buildSpeechletResponse('Wrong', speechOutput, repromptText, false));
}

/**
 * on AMAZON.StopIntent, AMAZON.CancelIntent, AMAZON.CancelIntent
 */
function getGoodbyeResponse(cb) {
  const speechOutput = 'Thank you for letting me help with your teeth!  Have a great day!';
  cb(null, buildSpeechletResponse('Goodbye', speechOutput, null, true));
}

/**
 * on recordBrushing
 */
function recordBrushing(intent, cb) {
  const smallchiName = intent.slots.smallchiName.value.toLowerCase();

  let newDate = new Date();
  newDate.setHours(newDate.getHours() - 5); // convert from UTC to CDT
  let timestamp = Math.round(newDate.getTime()/1000);

  const speechOutput = `That is wonderful!  I am so happy that you brushed your teeth, ${smallchiName}!`;
  const repromptText = `I love it when you brush your teeth, ${smallchiName}!`;

  if (kids.indexOf(smallchiName) == -1) {
    const speechOutput = `Good for you, ${smallchiName}!`;
    return cb(null, buildSpeechletResponse('Record', speechOutput, null, false));
  }

  let params = {
    TableName: docTable,
    Item:{
      'name': smallchiName,
      'timestamp': timestamp
    }
  };

  docClient.put(params, function(err, data) {
    // TODO aniham handle error
    if (err) {
      console.log(`Got error: ${JSON.stringify(err)}`);
    }
    return cb(null, buildSpeechletResponse('Record', speechOutput, repromptText, false));
  });
}

/**
 * on getLastBrushed
 */
function getLastBrushed(intent, cb) {
  let smallchiName = intent.slots.smallchiName.value.toLowerCase();
  if (kids.indexOf(smallchiName) == -1) {
    const speechOutput = `I don't know much about ${smallchiName}.  I only keep track of ${kids[0]} and ${kids[1]}.`;
    const repromptText = `Do you want to ask me when ${kids[0]} and ${kids[1]} brushed their teeth?`;
    return cb(null, buildSpeechletResponse('LastBrushed', speechOutput, repromptText, false));
  }

  let params = {
    TableName : docTable,
    KeyConditionExpression: '#name = :name',
    ExpressionAttributeNames:{
      '#name': 'name'
    },
    ExpressionAttributeValues: {
      ':name': smallchiName
    },
    ScanIndexForward: false, //desc
    Limit: 1
  };

  docClient.query(params, function(err, data) {
    // TODO aniham handle error
    if (err) {
      console.log(`Got error: ${JSON.stringify(err)}`);
    }
    let timestamp = data.Items[0].timestamp;
    let date = parseDate(timestamp);

    const speechOutput = `${smallchiName} last brushed her teeth ${date}`;
    const repromptText = `I am so proud of ${smallchiName} for brushing her teeth!`;
    return cb(null, buildSpeechletResponse('LastBrushed', speechOutput, repromptText, false));
  });
}

/**
 * on getBrushedOnDay
 */
// TODO return real data here
function getBrushedOnDay(intent, cb) {
  const smallchiName = intent.slots.smallchiName.value.toLowerCase();
  const day = intent.slots.day.value;

  if (kids.indexOf(smallchiName) == -1) {
    const speechOutput = `I don't know much about ${smallchiName}.  I only keep track of ${kids[1]} and ${kids[0]}.`;
    const repromptText = `Do you want to ask me when ${kids[1]} and ${kids[0]} brushed their teeth?`;
    return cb(null, buildSpeechletResponse('BrushedOnDay', speechOutput, repromptText, false));
  }

  if (day !== 'today' && day !== 'yesterday') {
    const speechOutput = `I am not sure about this day.  I can tell you if they brushed their teeth today or yesterday.  Your can ask, when did ${kids[1]} brush her teeth?`;
    return cb(null, buildSpeechletResponse('BrushedOnDay', speechOutput, null, false));
  }

  // get the start and end of today or yesterday
  let start = new Date();
  if (day === 'yesterday') {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(start.getHours() - 5); // convert from UTC to CDT
  start.setHours(0,0,0,0);

  let end = new Date();
  if (day === 'yesterday') {
    end.setDate(end.getDate() - 1);
  }
  end.setHours(end.getHours() - 5); // convert from UTC to CDT
  end.setHours(23,59,59,999);

  let fromDateTime = Math.round(start.getTime()/1000);
  let toDateTime = Math.round(end.getTime()/1000);

  let params = {
    TableName : docTable,
    KeyConditionExpression: '#timestamp BETWEEN :fromDateTime AND :toDateTime AND #name = :name',
    ExpressionAttributeNames:{
      '#name': 'name',
      '#timestamp': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':name': smallchiName,
      ':fromDateTime': fromDateTime,
      ':toDateTime': toDateTime
    },
    ScanIndexForward: false, //desc
    Limit: 1
  };

  docClient.query(params, function(err, data) {
    // TODO aniham handle error
    if (err) {
      console.log(`Got error: ${JSON.stringify(err)}`);
    }
    let count = data.Count;

    let speechOutput, repromptText;
    if (count > 0) {
      let timestamp = data.Items[0].timestamp;
      let date = parseDate(timestamp);
      speechOutput = `She did!  She brushed her teeth ${date}`;
      repromptText = 'You do such a great job of brushing your teeth!';
    } else {
      speechOutput = `No, it looks like ${smallchiName} did not brush her teeth ${day}`;
      repromptText = 'She still has time to do it today though!';
    }

    cb(null, buildSpeechletResponse('BrushedOnDay', speechOutput, repromptText, false));
  });
}

/**
 * Convert unix timestamp to format alexa can read to users.
 */
function parseDate(timestamp) {
  let today = new Date();
  today.setHours(today.getHours() - 5); // convert from UTC to CDT
  let yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(yesterday.getHours() - 5); // convert from UTC to CDT

  let date = new Date(timestamp*1000);
  let returnString;

  let hours = date.getHours();
  let minutes = date.getMinutes();
  let suffix = (hours >= 12) ? 'PM' : 'AM';
  if (hours > 12) {
    hours-=12;
  }
  let time = `${hours}:${minutes} ${suffix}`;

  if (date.toDateString() === today.toDateString()) {
    returnString = `today at ${time}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    returnString = `yesterday at ${time}`;
  } else {
    // TODO convert month to name, not number
    returnString = `on ${date.getMonth()+1} ${date.getDate()} at ${time}`;
  }

  return returnString;
}

function onIntent(intentRequest, session, cb) {
  const intent = intentRequest.intent;
  const intentName = intentRequest.intent.name;

//   console.log(`onIntent intent: ${JSON.stringify(intent)}, intentName: ${intentName}`);

  if (intentName === 'recordBrushing') {
    return recordBrushing(intent, cb);
  } else if (intentName === 'getLastBrushed') {
    return getLastBrushed(intent, cb);
  } else if (intentName === 'getBrushedOnDay') {
    return getBrushedOnDay(intent, cb);
  } else if (intentName === 'AMAZON.HelpIntent') {
    return getHelpResponse(cb);
  } else if (intentName === 'AMAZON.FallbackIntent') {
    return getFallbackResponse(cb);
  } else if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.NoIntent') {
    return getGoodbyeResponse(cb);
  } else {
    throw new Error('Invalid intent');
  }
}

/**
 * entry point
 */
exports.handler = (event, context, cb) => {
//   console.log(`event: ${JSON.stringify(event)}`);

  if (event.request.type === 'LaunchRequest') {
    return getWelcomeResponse((err, speechletResponse) => {
      // TODO aniham handle error
      cb(null, buildResponse(speechletResponse));
    });
  } else if (event.request.type === 'IntentRequest') {
    onIntent(event.request,
      event.session,
      (err, speechletResponse) => {
        // TODO aniham handle error
        cb(null, buildResponse( speechletResponse));
      });
  } else if (event.request.type === 'SessionEndedRequest') {
    return cb();
  }
};
