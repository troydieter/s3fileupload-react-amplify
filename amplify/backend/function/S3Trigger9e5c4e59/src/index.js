'use strict'

const AWS = require('aws-sdk')
AWS.config.region = process.env.AWS_REGION 
const s3 = new AWS.S3()

const { v4: uuidv4 } = require('uuid')
const sqs = new AWS.SQS({apiVersion: '2012-11-05'})

// The Lambda handler
exports.handler = async (event) => {
  console.log (JSON.stringify(event, null, 2))

  await Promise.all(
    event.Records.map(async (record) => {
      try {
        console.log('Incoming record: ', record)

        // Get original text from object in incoming event
        const originalText = await s3.getObject({
          Bucket: record.s3.bucket.name,
          Key: record.s3.object.key
        }).promise()

        const jsonData = JSON.parse(originalText.Body.toString('utf-8'))
        await addToSQS(jsonData)

      } catch (err) {
        console.error(err)
      }
    })
  )
}

// Add items to addToSQS
const addToSQS = async (data) => {
  // Separate into batches for upload
  let batches = []
  const BATCH_SIZE = 25

  while (data.length > 0) {
    batches.push(data.splice(0, BATCH_SIZE))
  }

  console.log(`Total batches: ${batches.length}`)

  let batchCount = 0

  // Save each batch
  await Promise.all(
    batches.map(async (item_data) => {

      const items = []
  
      item_data.forEach(item => {
        for (let key of Object.keys(item)) {
          // An AttributeValue may not contain an empty string
          if (item[key] === '') 
            delete item[key]
        }

        // Build params
        items.push({
          ID: uuidv4(),
          ...item
        })
      })

      // Params object for SQS
      const params = {
        MessageBody: JSON.stringify(items),
        QueueUrl: process.env.SQSqueueName,
        MessageGroupId: uuidv4()
      }
      
      // Push to SQS in batches
      try {
        batchCount++
        console.log('Trying batch: ', batchCount)
        const result = await sqs.sendMessage(params).promise()
        console.log('Success: ', result)
      } catch (err) {
        console.error('Error: ', err)
      }
    })
  )
}