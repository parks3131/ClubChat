//
//  Item.swift
//  ClubChat
//
//  Created by Parks RPK on 7/24/26.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
